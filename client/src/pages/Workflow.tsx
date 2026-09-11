import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ScanLine,
  CheckCircle2,
  User,
  UserCheck,
  Droplet,
  TestTube2,
  Timer,
  Loader2,
  AlertTriangle,
  Eye,
  Usb,
  Bug,
  X,
  Send,
  Download,
  Upload,
  Moon,
} from "lucide-react";
import { ActionButton } from "@/components/ActionButton";
import { StatusCard } from "@/components/StatusCard";
import { Header } from "@/components/Header";
import { QrScanner } from "@/components/QrScanner";
import { VoiceNotes, blobToBase64, type LocalVoiceNote } from "@/components/VoiceNotes";
import { useReader } from "@/hooks/useReader";
import { useCreateResult } from "@/hooks/use-results";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { api, buildUrl, type ResultResponse } from "@shared/routes";
import { cn } from "@/lib/utils";
import {
  parseResult,
  classifyValue,
  errorToDisplayText,
} from "@/lib/readerProtocol";
import { saveResultPdfLocally } from "@/lib/resultPdf";
import logoPng from "@assets/Vertical_logo_bgtransparent_1769613129480.png";

// App-controlled phases. Nurse + patient identification happen on the phone;
// after that the physical reader becomes the host and drives every screen.
type Phase = "connect" | "nurse-scan" | "patient-scan" | "running";

const TEST_DURATION_SECONDS = 300; // 5-minute assay countdown (visual)

// Generate the mock SAA2 reading in its native mg/L range. It remains hidden
// from the result screen and is mapped to the unitless Abacus Index below.
const randomResultLine = () => {
  const bands: Array<[number, number]> = [
    [1, 10],
    [10, 50],
    [50, 200],
    [200, 300],
    [300, 550],
  ];
  const [min, max] = bands[Math.floor(Math.random() * bands.length)];
  const value = (min + Math.random() * (max - min)).toFixed(1);
  return `RESULT:${value}:mg/L`;
};

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

export default function Workflow() {
  const [phase, setPhase] = useState<Phase>("connect");
  const [nurseId, setNurseId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const [resultAt, setResultAt] = useState<Date | null>(null);
  const [devOpen, setDevOpen] = useState(false);
  // Once the reader sends DISPLAYRESULT we lock the result screen here so any
  // subsequent reader messages (e.g. SCREEN:HOME after the test completes) do
  // not replace the result view. Cleared only when the nurse taps "New Test".
  const [resultLocked, setResultLocked] = useState(false);
  // Snapshot of the result text captured the moment DISPLAYRESULT first
  // arrives. Kept here so renderResult() still has the value even after the
  // reader moves on and clears readerState.resultText.
  const [snapshotResultText, setSnapshotResultText] = useState<string | null>(null);
  // The row created by the auto-save — its id is what voice notes and the
  // health-record push attach to.
  const [savedResult, setSavedResult] = useState<ResultResponse | null>(null);
  // Voice notes recorded on the result screen, held locally until pushed.
  const [voiceNotes, setVoiceNotes] = useState<LocalVoiceNote[]>([]);
  const [pushStatus, setPushStatus] = useState<"idle" | "pushing" | "pushed">("idle");
  // True while the microphone is live in the VoiceNotes card — pushing is
  // blocked until the nurse taps stop so no clip is silently left behind.
  const [isRecording, setIsRecording] = useState(false);

  const { toast } = useToast();
  const createResult = useCreateResult();
  const reader = useReader();
  const { readerState } = reader;
  const view = readerState.currentView;

  const prevViewRef = useRef("");
  const autoConnectedRef = useRef(false);
  const simPlayedRef = useRef(false);
  // Incremented on every New Test / Home reset. Async work (save, push)
  // captures the value when it starts and bails out of all state updates if a
  // new test has begun since — a late network response must never contaminate
  // the next patient's test.
  const testSessionRef = useRef(0);
  // Single-flight guard for creating the result row: the auto-save effect and
  // the push handler both await this same promise, so a slow network can never
  // produce duplicate rows. Cleared on failure so the next trigger retries.
  const createPromiseRef = useRef<Promise<ResultResponse> | null>(null);

  // --- Start the assay countdown when the device reports SAMPLE_DETECTED ---
  useEffect(() => {
    if (phase === "running" && view === "SAMPLE_DETECTED" && prevViewRef.current !== "SAMPLE_DETECTED") {
      setTimeLeft(TEST_DURATION_SECONDS);
    }
    prevViewRef.current = view;
  }, [view, phase]);

  // Keep the countdown running through CHECKING and any other post-sample
  // screens until it reaches zero or DISPLAYRESULT arrives.
  const timerActive = phase === "running" && timeLeft > 0;
  useEffect(() => {
    if (!timerActive) return;
    const id = setInterval(() => setTimeLeft((t) => (t > 0 ? t - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [timerActive]);

  // --- Lock the result screen once DISPLAYRESULT arrives -------------------
  // Snapshot the result text immediately so it survives reader state changes
  // (the reader clears resultText when it moves to the next screen).
  // effectiveView stays pinned to DISPLAYRESULT until "New Test" is tapped.
  useEffect(() => {
    if (phase === "running" && view === "DISPLAYRESULT" && readerState.resultText) {
      setSnapshotResultText(readerState.resultText);
      setResultLocked(true);
      // Display timestamp is set when the result appears, independent of
      // whether the server save succeeds.
      setResultAt((prev) => prev ?? new Date());
    }
  }, [phase, view, readerState.resultText]);

  // --- Persist the result once the device displays it ----------------------
  // Single-flight: the auto-save effect below and the push handler both call
  // this and await the same promise. setSavedResult is session-guarded so a
  // response arriving after "New Test" cannot leak into the next test.
  const ensureResultSaved = (): Promise<ResultResponse> => {
    if (createPromiseRef.current) return createPromiseRef.current;
    const session = testSessionRef.current;
    const parsed = parseResult(snapshotResultText ?? readerState.resultText);
    if (parsed.value == null) return Promise.reject(new Error("No valid result to save"));
    const { level, interpretation } = classifyValue(parsed.value);
    const promise = createResult
      .mutateAsync({
        nurseId: nurseId || "UNKNOWN",
        patientId: patientId || "UNKNOWN",
        value: parsed.value,
        units: parsed.units || "mg/L",
        level,
        interpretation,
      })
      .then((created) => {
        if (testSessionRef.current === session) setSavedResult(created);
        return created;
      })
      .catch((err) => {
        // Allow a retry (next reader message or the push button).
        if (createPromiseRef.current === promise) createPromiseRef.current = null;
        throw err;
      });
    createPromiseRef.current = promise;
    return promise;
  };

  useEffect(() => {
    if (phase !== "running") return;
    // Only DISPLAYRESULT carries a valid result payload — every other screen
    // clears resultText in applyMessage, so this is the single save trigger.
    if (view !== "DISPLAYRESULT" || !readerState.resultText) return;
    ensureResultSaved().catch(() => {
      /* Guard was cleared — retried on the next trigger or via push. */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readerState, phase, view]);

  // Native auto-connect: mirror the Flutter app, which opens the USB connection
  // as soon as the reader screen appears. Runs once on the packaged Android
  // build; on the web the user taps "Begin Test" instead.
  useEffect(() => {
    if (autoConnectedRef.current || !reader.isNativePlatform) return;
    autoConnectedRef.current = true;
    (async () => {
      try {
        await reader.connectNative();
        setPhase("nurse-scan");
      } catch {
        /* No device yet or permission denied — the connect screen stays up. */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Simulator preview: once the phone-side scans are done and the device-driven
  // phase begins, auto-play a realistic reader sequence so the whole flow is
  // visible without touching the manual panel. Runs once per test; the manual
  // Reader Simulator panel below is still available to trigger specific states.
  useEffect(() => {
    if (phase !== "running" || reader.kind !== "simulator" || simPlayedRef.current) return;
    simPlayedRef.current = true;
    const sequence: Array<{ at: number; line: string }> = [
      { at: 300, line: "BATTERY:HIGH" },
      { at: 800, line: "SCREEN:HOME" },
      { at: 2300, line: "VIEW:APPLY_DROPS" },
      { at: 3800, line: "VIEW:SAMPLE_DETECTED" },
      { at: 6300, line: "SCREEN:RUNASSAY" },
      { at: 7500, line: randomResultLine() },
      { at: 7800, line: "SCREEN:DISPLAYRESULT" },
    ];
    const timers = sequence.map(({ at, line }) => setTimeout(() => reader.inject(line), at));
    return () => timers.forEach(clearTimeout);
  }, [phase, reader.kind, reader.inject]);

  // --- Handlers ------------------------------------------------------------
  const connectUsb = async () => {
    try {
      if (reader.isNativePlatform) {
        await reader.connectNative();
      } else {
        await reader.connectWebSerial();
      }
      setPhase("nurse-scan");
    } catch {
      toast({
        title: "Reader not connected",
        description: reader.isNativePlatform
          ? "Plug the reader into the phone and allow USB access when prompted, then try again."
          : reader.webSerialSupported
          ? "No device detected over USB. Plug the device into this computer, or use the Android app with the device plugged into the phone. You can also tap \u201CUse Simulator\u201D."
          : "USB serial needs desktop Chrome/Edge or the packaged Android app. You can also tap \u201CUse Simulator\u201D.",
        variant: "destructive",
      });
    }
  };

  const connectSimulator = async () => {
    await reader.connectSimulator();
    setPhase("nurse-scan");
  };

  const newTest = () => {
    testSessionRef.current += 1; // invalidate any in-flight save/push
    createPromiseRef.current = null;
    simPlayedRef.current = false;
    setIsRecording(false);
    setResultLocked(false);
    setSnapshotResultText(null);
    voiceNotes.forEach((n) => URL.revokeObjectURL(n.url));
    setVoiceNotes([]);
    setPushStatus("idle");
    setSavedResult(null);
    setNurseId("");
    setPatientId("");
    setTimeLeft(0);
    setResultAt(null);
    reader.resetReaderState();
    // "New Test" returns to the very first screen (the page
    // before the nurse QR scan) and drops the connection so the next test
    // starts completely fresh.
    void reader.disconnect();
    setPhase("connect");
  };

  const goHome = async () => {
    await reader.disconnect();
    testSessionRef.current += 1; // invalidate any in-flight save/push
    createPromiseRef.current = null;
    simPlayedRef.current = false;
    setIsRecording(false);
    setResultLocked(false);
    setSnapshotResultText(null);
    voiceNotes.forEach((n) => URL.revokeObjectURL(n.url));
    setVoiceNotes([]);
    setPushStatus("idle");
    setSavedResult(null);
    setNurseId("");
    setPatientId("");
    setTimeLeft(0);
    setResultAt(null);
    reader.resetReaderState();
    setPhase("connect");
  };

  // --- Push to health record ------------------------------------------------
  // Ensures the result row exists (awaiting the same single-flight create as
  // the auto-save), uploads any voice notes that haven't been uploaded yet,
  // then stamps the record as pushed. Safe to retry — uploaded notes are
  // skipped. Every state update after an await is session-guarded so a push
  // finishing after "New Test" cannot touch the next test's screen.
  const pushToHealthRecord = async () => {
    if (pushStatus !== "idle" || isRecording) return;
    const session = testSessionRef.current;
    setPushStatus("pushing");
    try {
      const saved = savedResult ?? (await ensureResultSaved());
      if (testSessionRef.current !== session) return;
      const resultId = saved.id;

      for (const note of voiceNotes) {
        if (note.uploaded) continue;
        const audioBase64 = await blobToBase64(note.blob);
        await apiRequest("POST", buildUrl(api.voiceNotes.create.path, { id: resultId }), {
          mimeType: note.mimeType,
          durationSec: note.durationSec,
          audioBase64,
        });
        if (testSessionRef.current !== session) return;
        setVoiceNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, uploaded: true } : n)));
      }

      await apiRequest("POST", buildUrl(api.results.push.path, { id: resultId }));
      if (testSessionRef.current !== session) return;
      setPushStatus("pushed");

      // Local PDF copy of the result screen. Best-effort: the push has already
      // succeeded, so a PDF problem is reported but never undoes the push.
      let pdfNote: string | null = null;
      try {
        const parsed = parseResult(snapshotResultText ?? readerState.resultText);
        if (parsed.value != null) {
          const location = await saveResultPdfLocally({
            nurseId: nurseId || "UNKNOWN",
            patientId: patientId || "UNKNOWN",
            value: parsed.value,
            units: parsed.units || "mg/L",
            resultAt: resultAt ?? new Date(),
            voiceNoteCount: voiceNotes.length,
          });
          pdfNote = `PDF saved: ${location}`;
        }
      } catch {
        pdfNote = "PDF copy could not be saved on this device.";
      }
      if (testSessionRef.current !== session) return;

      toast({
        title: "Pushed to health record",
        description: [
          voiceNotes.length > 0
            ? `Result and ${voiceNotes.length} voice note${voiceNotes.length === 1 ? "" : "s"} saved to the patient record.`
            : "Result saved to the patient record.",
          pdfNote,
        ]
          .filter(Boolean)
          .join(" "),
      });
    } catch (err) {
      if (testSessionRef.current !== session) return;
      setPushStatus("idle");
      toast({
        title: "Push failed",
        description:
          err instanceof Error && err.message !== "Failed to fetch"
            ? err.message
            : "Could not reach the server. Check the connection and try again.",
        variant: "destructive",
      });
    }
  };

  // --- Device-driven screens ----------------------------------------------
  // Priority 1: once DISPLAYRESULT has been received, hold that screen until
  //   the nurse explicitly taps "New Test". Any subsequent reader messages
  //   (e.g. SCREEN:HOME after the assay completes) are ignored for display.
  // Priority 2: while the 5-min countdown is active, keep showing
  //   "Analysis in Progress" even if the reader moves to CHECKING.
  const effectiveView = resultLocked
    ? "DISPLAYRESULT"
    : view === "CHECKING" && timerActive
    ? "SAMPLE_DETECTED"
    : view;

  // Views with their own dedicated screen. Everything else (WAITING, POWEROFF,
  // INSERT_CARTRIDGE, unknown messages) renders the Insert Cartridge screen,
  // so they share one animation key — otherwise moving between two of them
  // (e.g. WAITING → INSERT_CARTRIDGE) replays the transition between two
  // identical-looking screens and the nurse sees "Insert Cartridge" twice.
  const DEDICATED_VIEWS = new Set([
    "APPLY_DROPS",
    "SAMPLE_DETECTED",
    "CHECKING",
    "UPDATING",
    "DISPLAYRESULT",
    "UPDATE_FINISHED",
    "ERROR",
    "BARCODE_INVALID",
    "NOCLINE",
    "CLEAN_LENS",
    "WAKEUP",
  ]);
  const screenKey = DEDICATED_VIEWS.has(effectiveView) ? effectiveView : "INSERT_CARTRIDGE";

  const renderDeviceView = () => {
    switch (effectiveView) {
      case "APPLY_DROPS":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <div className="w-40 h-40 bg-amber-50 rounded-full flex items-center justify-center">
              <Droplet className="w-20 h-20 text-amber-500" />
            </div>
            <StatusCard
              icon={Droplet}
              title="Apply Sample"
              description="Apply the sample drops to the cartridge well"
              status="warning"
            />
          </div>
        );

      case "SAMPLE_DETECTED":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <div className="relative flex items-center justify-center">
              <svg className="w-56 h-56 transform -rotate-90">
                <circle cx="112" cy="112" r="104" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-secondary" />
                <circle
                  cx="112"
                  cy="112"
                  r="104"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={2 * Math.PI * 104}
                  strokeDashoffset={2 * Math.PI * 104 * (1 - timeLeft / TEST_DURATION_SECONDS)}
                  className="text-primary transition-all duration-1000 ease-linear"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-mono font-bold tabular-nums">{formatTime(timeLeft)}</span>
                <span className="text-xs uppercase font-bold text-muted-foreground mt-1">Remaining</span>
              </div>
            </div>
            <StatusCard
              icon={Timer}
              title="Analysis in Progress"
              description="Sample detected. Do not remove the cartridge."
              status="processing"
            />
          </div>
        );

      case "CHECKING":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <div className="w-28 h-28 bg-primary/10 rounded-full flex items-center justify-center">
              <Loader2 className="w-14 h-14 text-primary animate-spin" />
            </div>
            <StatusCard icon={Loader2} title="Checking…" description="The reader is working. Please wait." status="processing" />
          </div>
        );

      case "UPDATING":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <div className="w-28 h-28 bg-primary/10 rounded-full flex items-center justify-center">
              <Download className="w-14 h-14 text-primary animate-pulse" />
            </div>
            <StatusCard icon={Download} title="Updating" description="The reader is updating its firmware." status="processing" />
          </div>
        );

      case "DISPLAYRESULT":
        return renderResult();

      case "UPDATE_FINISHED":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-green-600" />
            </div>
            <StatusCard icon={CheckCircle2} title="Finished" description="The reader has finished. Remove the cartridge." status="success" />
            <ActionButton fullWidth onClick={newTest} data-testid="button-new-test-finished">
              New Test
            </ActionButton>
          </div>
        );

      case "ERROR":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <StatusCard
              icon={AlertTriangle}
              title="Reader Error"
              description={readerState.errorText ? errorToDisplayText(readerState.errorText) : "The reader reported an error."}
              status="error"
            />
          </div>
        );

      case "BARCODE_INVALID":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <StatusCard icon={AlertTriangle} title="Barcode Invalid" description="The cartridge barcode could not be read." status="error" />
          </div>
        );

      case "NOCLINE":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <StatusCard icon={AlertTriangle} title="No Control Line" description="No control line detected. Please retest." status="error" />
          </div>
        );

      case "CLEAN_LENS":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <StatusCard icon={Eye} title="Clean Lens" description="Please clean the reader lens and try again." status="warning" />
          </div>
        );

      case "WAKEUP":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <StatusCard icon={Moon} title="Wake Device" description="Waking the reader…" status="processing" />
          </div>
        );

      case "INSERT_CARTRIDGE":
      case "WAITING":
      case "POWEROFF":
      default:
        // The reader is not smart — if the app hasn't received a recognisable
        // screen yet (startup, WAITING, POWEROFF, or any unknown message),
        // always show the first assay step instead of a vague "waiting" or
        // "powering off" screen. The nurse's next action is always the same:
        // insert a cartridge.
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <img src={logoPng} alt="Abacus Labs" className="h-28 w-auto mx-auto object-contain" />
            <StatusCard
              icon={TestTube2}
              title="Insert Cartridge"
              description="Insert the SAA2 cartridge into the reader port"
            />
            <PatientChips />
          </div>
        );
    }
  };

  const PatientChips = () => (
    <div className="w-full bg-muted/60 border border-border rounded-xl px-3 py-2 flex items-center justify-around text-xs text-muted-foreground">
      <div className="text-center">
        <span className="uppercase tracking-wide block">Nurse</span>
        <span className="font-bold text-foreground">{nurseId || "—"}</span>
      </div>
      <div className="text-center">
        <span className="uppercase tracking-wide block">Patient</span>
        <span className="font-bold text-foreground">{patientId || "—"}</span>
      </div>
    </div>
  );

  const renderResult = () => {
    // Use the snapshotted text — readerState.resultText may already be cleared
    // if the reader has moved on to its next screen (INSERT_CARTRIDGE, HOME…).
    const parsed = parseResult(snapshotResultText ?? readerState.resultText);
    // Never fabricate a clinical value: if the reader did not send a valid
    // numeric result, show a safe "unavailable" state instead of a 0 band.
    if (parsed.value == null) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
          <StatusCard
            icon={AlertTriangle}
            title="Result Unavailable"
            description="No valid result was received from the reader. Please retest."
            status="error"
          />
          <ActionButton fullWidth onClick={newTest} data-testid="button-new-test">
            New Test
          </ActionButton>
        </div>
      );
    }
    const value = parsed.value;
    const units = parsed.units || "mg/L";

    type Band = { label: string; bg: string; border: string; textColor: string; badgeColor: string; zone: string };
    const band: Band =
      value < 10
        ? { label: "Very Low", bg: "bg-green-50", border: "border-green-200", textColor: "text-green-900", badgeColor: "bg-green-800", zone: "Zone 5" }
        : value < 50
        ? { label: "Low", bg: "bg-green-50", border: "border-green-200", textColor: "text-green-700", badgeColor: "bg-green-500", zone: "Zone 4" }
        : value <= 200
        ? { label: "Moderate", bg: "bg-yellow-50", border: "border-yellow-200", textColor: "text-yellow-700", badgeColor: "bg-yellow-500", zone: "Zone 3" }
        : value <= 300
        ? { label: "High", bg: "bg-orange-50", border: "border-orange-200", textColor: "text-orange-700", badgeColor: "bg-orange-500", zone: "Zone 2" }
        : { label: "Very High", bg: "bg-red-50", border: "border-red-200", textColor: "text-red-700", badgeColor: "bg-red-500", zone: "Zone 1" };

    // Map the hidden 1–550 mg/L mock range linearly to a discrete, unitless
    // Abacus Index score from 0.1–100.0.
    const abacusIndex = Math.round(
      Math.min(Math.max(0.1 + ((value - 1) / 549) * 99.9, 0.1), 100) * 10,
    ) / 10;
    const gaugePinPct = ((abacusIndex - 0.1) / 99.9) * 100;
    const gaugeZone = Math.min(Math.floor((abacusIndex - 0.1) / 25) + 1, 4);
    const gaugeLabels = [
      "Definite Viral",
      "Probable Viral",
      "Probable Bacterial",
      "Definite Bacterial",
    ];
    const gaugeLabel = gaugeLabels[gaugeZone - 1];
    const pinLeft = `clamp(12px, calc(${gaugePinPct}% - 12px), calc(100% - 12px))`;

    return (
      <div className="flex flex-col h-full max-w-sm mx-auto">
        <div className="flex-1 overflow-y-auto pb-4 space-y-3">
          <div className="bg-muted/60 border border-border rounded-xl px-3 py-2 flex items-center justify-between text-xs text-muted-foreground" data-testid="card-patient-info-header">
            <div>
              <span className="uppercase tracking-wide block">Patient ID</span>
              <span className="font-bold text-foreground">{patientId || "—"}</span>
            </div>
            <div className="text-center">
              <span className="uppercase tracking-wide block">Nurse</span>
              <span className="font-bold text-foreground">{nurseId || "—"}</span>
            </div>
            {resultAt && (
              <div className="text-right">
                <span className="block">{resultAt.toLocaleDateString()}</span>
                <span>{resultAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            )}
          </div>

          <div className={cn("p-4 rounded-xl border-2 text-center", band.bg, band.border)} data-testid="card-probability">
            <span className="text-sm font-bold uppercase opacity-60 block mb-2">SAA.2 Score</span>
            <span className={cn("inline-block text-xl font-bold px-5 py-1.5 rounded-full text-white", band.badgeColor)} data-testid="text-sbi-probability">
              {value.toFixed(1)} {units}
            </span>
          </div>

          <div className="bg-card border border-border rounded-xl p-5 shadow-sm" data-testid="card-severity-gauge">
            <div className="flex items-center justify-between mb-5">
              <span className="text-sm font-bold text-foreground uppercase tracking-wider block">Abacus Index</span>
              <span className="text-sm font-bold px-3 py-1 rounded-full text-white bg-gray-700">
                {abacusIndex.toFixed(1)} · {gaugeLabel}
              </span>
            </div>
            <div className="relative px-1">
              <div className="absolute bottom-[calc(100%-2px)] flex flex-col items-center" style={{ left: pinLeft }}>
                <div className="w-0 h-0 border-l-[14px] border-l-transparent border-r-[14px] border-r-transparent border-t-[18px] border-t-gray-700" />
              </div>
              <div className="mt-10 rounded-xl border-2 border-gray-200 overflow-hidden">
                <div className="flex h-10">
                  <div className="bg-green-500 flex-1" />
                  <div className="bg-yellow-400 flex-1" />
                  <div className="bg-orange-500 flex-1" />
                  <div className="bg-red-500 flex-1" />
                </div>
              </div>
            </div>
            <div className="flex mt-3">
              {[
                { range: "0.1–25.0", first: "Definite", second: "Viral" },
                { range: "25.1–50.0", first: "Probable", second: "Viral" },
                { range: "50.1–75.0", first: "Probable", second: "Bacterial" },
                { range: "75.1–100.0", first: "Definite", second: "Bacterial" },
              ].map(({ range, first, second }) => (
                <div key={range} className="flex-1 text-center text-xs leading-tight font-bold text-foreground px-1 break-words">
                  <span className="block">{range}</span>
                  <span className="block mt-1.5">{first}</span>
                  <span className="block">{second}</span>
                </div>
              ))}
            </div>
          </div>

          <VoiceNotes
            notes={voiceNotes}
            onAdd={(note) => setVoiceNotes((prev) => [...prev, note])}
            onDelete={(id) =>
              setVoiceNotes((prev) => {
                const note = prev.find((n) => n.id === id);
                if (note) URL.revokeObjectURL(note.url);
                return prev.filter((n) => n.id !== id);
              })
            }
            locked={pushStatus !== "idle"}
            onRecordingChange={setIsRecording}
          />

          {pushStatus === "pushed" ? (
            <div
              className="w-full bg-green-50 border-2 border-green-200 rounded-xl px-4 py-3 flex items-center justify-center gap-2 text-green-700 font-semibold"
              data-testid="status-pushed-to-record"
            >
              <CheckCircle2 className="w-5 h-5" />
              Pushed to Health Record
            </div>
          ) : (
            <ActionButton
              fullWidth
              onClick={pushToHealthRecord}
              disabled={pushStatus === "pushing" || createResult.isPending || isRecording}
              data-testid="button-push-to-record"
            >
              {pushStatus === "pushing" ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Pushing…
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 mr-2" />
                  Push to Health Record
                </>
              )}
            </ActionButton>
          )}

          <ActionButton variant="outline" fullWidth onClick={newTest} data-testid="button-new-test">
            New Test
          </ActionButton>
        </div>
      </div>
    );
  };

  // --- App-controlled screens ---------------------------------------------
  const renderContent = () => {
    switch (phase) {
      case "connect":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-8 max-w-sm mx-auto">
            <img src={logoPng} alt="Abacus Labs" className="h-36 w-auto mx-auto object-contain" />
            <div className="w-full space-y-3">
              <ActionButton fullWidth onClick={connectUsb} disabled={reader.connecting} data-testid="button-connect-usb">
                <Usb className="w-5 h-5 mr-2" />
                {reader.connecting ? "Starting…" : "Start Real Test"}
              </ActionButton>
              <ActionButton variant="outline" fullWidth onClick={connectSimulator} disabled={reader.connecting} data-testid="button-connect-simulator">
                <Bug className="w-5 h-5 mr-2" />
                Simulator
              </ActionButton>
            </div>
          </div>
        );

      case "nurse-scan":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 w-full max-w-2xl mx-auto">
            <h2 className="text-2xl font-display font-bold">Scan Nurse ID</h2>
            <QrScanner
              onScan={(text) => {
                setNurseId(text);
                setPhase("patient-scan");
              }}
            />
          </div>
        );

      case "patient-scan":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 w-full max-w-2xl mx-auto">
            <h2 className="text-2xl font-display font-bold">Scan Patient ID</h2>
            <QrScanner
              onScan={(text) => {
                setPatientId(text);
                setPhase("running");
              }}
            />
            <p className="text-xs text-muted-foreground">Nurse: <span className="font-mono font-bold text-foreground">{nurseId}</span></p>
          </div>
        );

      case "running":
        return renderDeviceView();
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <Header onLogoClick={goHome} connected={reader.connected} />

      <main className="flex-1 px-6 pt-[calc(5rem+env(safe-area-inset-top))] pb-8 safe-area-pb overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${phase}-${phase === "running" ? screenKey : ""}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="h-full"
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      {reader.kind === "simulator" && (
        <SimulatorPanel
          open={devOpen}
          onToggle={() => setDevOpen((o) => !o)}
          logs={reader.logs}
          onInject={reader.inject}
          onClear={reader.clearLogs}
        />
      )}
    </div>
  );
}

// === SIMULATOR PANEL =======================================================
// Development helper: inject serial lines to exercise the device-driven flow
// without physical hardware. Only rendered when connected via the simulator.

interface SimulatorPanelProps {
  open: boolean;
  onToggle: () => void;
  logs: string[];
  onInject: (line: string) => void;
  onClear: () => void;
}

const QUICK_MESSAGES: Array<{ label: string; lines: string[] }> = [
  { label: "Battery: High", lines: ["BATTERY:HIGH"] },
  { label: "Insert cartridge", lines: ["SCREEN:HOME"] },
  { label: "Apply drops", lines: ["VIEW:APPLY_DROPS"] },
  { label: "Sample detected", lines: ["VIEW:SAMPLE_DETECTED"] },
  { label: "Running assay", lines: ["SCREEN:RUNASSAY"] },
  { label: "Show result", lines: ["RESULT:12.34:mg/dL", "SCREEN:DISPLAYRESULT"] },
  { label: "Error: low C-line", lines: ["ERROR:LOW_CLINE"] },
  { label: "Clean lens", lines: ["SCREEN:CLEANLENS"] },
  { label: "Power off", lines: ["SCREEN:POWEROFF"] },
];

function SimulatorPanel({ open, onToggle, logs, onInject, onClear }: SimulatorPanelProps) {
  const [custom, setCustom] = useState("");

  const injectAll = (lines: string[]) => lines.forEach((l) => onInject(l));

  const runSequence = () => {
    const seq = [
      "BATTERY:HIGH",
      "SCREEN:HOME",
      "VIEW:APPLY_DROPS",
      "VIEW:SAMPLE_DETECTED",
      "SCREEN:RUNASSAY",
      randomResultLine(),
      "SCREEN:DISPLAYRESULT",
    ];
    seq.forEach((line, i) => setTimeout(() => onInject(line), i * 1200));
  };

  return (
    <>
      <button
        onClick={onToggle}
        aria-label="Toggle simulator"
        data-testid="button-dev-toggle"
        className="fixed bottom-4 left-4 z-50 w-11 h-11 rounded-full bg-slate-800 text-white flex items-center justify-center shadow-lg hover:bg-slate-700"
      >
        {open ? <X className="w-5 h-5" /> : <Bug className="w-5 h-5" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.25 }}
            className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900 text-white rounded-t-2xl shadow-2xl max-h-[70vh] flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <span className="font-bold text-sm">Reader Simulator</span>
              <button onClick={runSequence} className="text-xs px-3 py-1 rounded-full bg-primary text-primary-foreground font-semibold" data-testid="button-run-sequence">
                Run full sequence
              </button>
            </div>

            <div className="p-3 grid grid-cols-3 gap-2">
              {QUICK_MESSAGES.map((m) => (
                <button
                  key={m.label}
                  onClick={() => injectAll(m.lines)}
                  className="text-[11px] px-2 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors leading-tight"
                  data-testid={`button-inject-${m.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="px-3 pb-2 flex gap-2">
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && custom.trim()) {
                    onInject(custom.trim());
                    setCustom("");
                  }
                }}
                placeholder="Custom line e.g. VIEW:INSERT_CARTRIDGE"
                className="flex-1 h-9 px-3 rounded-lg bg-black/40 border border-white/10 text-xs font-mono outline-none focus:border-primary"
                data-testid="input-custom-line"
              />
              <button
                onClick={() => {
                  if (custom.trim()) {
                    onInject(custom.trim());
                    setCustom("");
                  }
                }}
                className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"
                data-testid="button-send-custom"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between px-4 py-1">
              <span className="text-[10px] uppercase tracking-wider text-white/40">UART log</span>
              <button onClick={onClear} className="text-[10px] text-white/60 hover:text-white" data-testid="button-clear-logs">
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 font-mono text-[11px] text-green-400 space-y-0.5 min-h-[80px]">
              {logs.length === 0 ? (
                <p className="text-white/30">No UART logs yet</p>
              ) : (
                logs.slice(-100).map((l, i) => <div key={i}>{l}</div>)
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
