import { useEffect, useRef, useState } from "react";
import { Mic, Play, Square, Trash2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// A voice note recorded on this device for the result currently on screen.
// Kept in memory (blob + object URL) until it is pushed to the health record;
// the parent owns the list and revokes object URLs when notes are discarded.
export interface LocalVoiceNote {
  id: string;
  blob: Blob;
  url: string;
  mimeType: string;
  durationSec: number;
  uploaded: boolean;
}

const MAX_RECORDING_SECONDS = 120;

// Android WebView / Chrome record webm+opus; audio/mp4 covers Safari on the
// desktop preview. The first supported entry wins.
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

export function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Strip the data-URL prefix and return the raw base64 payload. */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

interface VoiceNotesProps {
  notes: LocalVoiceNote[];
  onAdd: (note: LocalVoiceNote) => void;
  onDelete: (id: string) => void;
  /** True while pushing / after pushed — recording and deleting are disabled, playback stays available. */
  locked?: boolean;
  /** Notified when the mic goes live/idle so the parent can block pushing mid-recording. Pass a stable callback. */
  onRecordingChange?: (recording: boolean) => void;
}

export function VoiceNotes({ notes, onAdd, onDelete, locked = false, onRecordingChange }: VoiceNotesProps) {
  const { toast } = useToast();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Set before unmount teardown so a late MediaRecorder onstop discards its
  // blob instead of adding a note to the (already reset) parent list.
  const unmountedRef = useRef(false);

  const cleanupRecording = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
    setElapsed(0);
    onRecordingChange?.(false);
  };

  // Unmount: stop any live recording and playback, release the microphone.
  useEffect(
    () => () => {
      unmountedRef.current = true;
      const r = recorderRef.current;
      if (r && r.state !== "inactive") {
        try {
          r.stop();
        } catch {
          /* already stopped */
        }
      }
      if (tickRef.current) clearInterval(tickRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioRef.current?.pause();
      onRecordingChange?.(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const stopRecording = () => {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") {
      try {
        r.stop(); // onstop finalises the note and cleans up
      } catch {
        cleanupRecording();
      }
    } else {
      cleanupRecording();
    }
  };

  const startRecording = async () => {
    if (recording || locked) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast({
        title: "Recording unavailable",
        description: "This device or browser does not support audio recording.",
        variant: "destructive",
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        if (unmountedRef.current) {
          // The result screen was reset mid-recording — discard the clip so it
          // can never be attached to the next patient's test.
          chunksRef.current = [];
          return;
        }
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        // Chrome reports Infinity for webm blob duration, so we time it ourselves.
        const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        chunksRef.current = [];
        cleanupRecording();
        if (blob.size === 0) {
          toast({
            title: "Nothing recorded",
            description: "The microphone produced no audio. Please try again.",
            variant: "destructive",
          });
          return;
        }
        onAdd({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          blob,
          url: URL.createObjectURL(blob),
          mimeType: type,
          durationSec,
          uploaded: false,
        });
      };

      recorder.start();
      setRecording(true);
      onRecordingChange?.(true);
      setElapsed(0);
      tickRef.current = setInterval(() => {
        const sec = Math.round((Date.now() - startedAtRef.current) / 1000);
        setElapsed(sec);
        if (sec >= MAX_RECORDING_SECONDS) stopRecording();
      }, 500);
    } catch {
      cleanupRecording();
      toast({
        title: "Microphone blocked",
        description: "Allow microphone access to record a voice note.",
        variant: "destructive",
      });
    }
  };

  const togglePlay = (note: LocalVoiceNote) => {
    if (playingId === note.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(note.url);
    audioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => setPlayingId(null);
    void audio.play().catch(() => setPlayingId(null));
    setPlayingId(note.id);
  };

  // After a push with no notes there is nothing to show or do.
  if (locked && notes.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3" data-testid="card-voice-notes">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
          <Mic className="w-4 h-4 text-primary" />
          Voice Notes
        </span>
        {notes.length > 0 && (
          <span className="text-xs font-bold text-muted-foreground" data-testid="text-voice-note-count">
            {notes.length}
          </span>
        )}
      </div>

      {notes.map((note, i) => (
        <div
          key={note.id}
          className="flex items-center gap-3 bg-muted/60 border border-border rounded-lg px-3 py-2"
          data-testid={`row-voice-note-${i}`}
        >
          <button
            onClick={() => togglePlay(note)}
            aria-label={playingId === note.id ? "Stop playback" : "Play voice note"}
            className="w-10 h-10 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20"
            data-testid={`button-play-note-${i}`}
          >
            {playingId === note.id ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold block">Note {i + 1}</span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              {formatDuration(note.durationSec)}
              {note.uploaded && (
                <>
                  <span>·</span>
                  <CheckCircle2 className="w-3 h-3 text-green-600" />
                  <span className="text-green-700">saved</span>
                </>
              )}
            </span>
          </div>
          {!locked && !note.uploaded && (
            <button
              onClick={() => onDelete(note.id)}
              aria-label="Delete voice note"
              className="w-9 h-9 shrink-0 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center"
              data-testid={`button-delete-note-${i}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}

      {recording ? (
        <button
          onClick={stopRecording}
          className="w-full h-12 rounded-xl bg-red-50 border-2 border-red-300 text-red-600 font-semibold flex items-center justify-center gap-2"
          data-testid="button-stop-recording"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          Recording {formatDuration(elapsed)} — Tap to Stop
        </button>
      ) : (
        !locked && (
          <button
            onClick={startRecording}
            className="w-full h-12 rounded-xl border-2 border-dashed border-border text-muted-foreground font-semibold flex items-center justify-center gap-2 hover:bg-secondary/50 hover:text-foreground transition-colors"
            data-testid="button-record-voice-note"
          >
            <Mic className="w-4 h-4" />
            Record Voice Note
          </button>
        )
      )}
    </div>
  );
}
