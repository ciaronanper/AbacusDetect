import React, { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, Keyboard } from "lucide-react";

interface QrScannerProps {
  label: string;
  /** Called once with the decoded QR text (or manually entered value). */
  onScan: (text: string) => void;
}

// --- Camera-selection helpers ------------------------------------------------
// Goal: on multi-lens phones (Samsung Galaxy S22 etc.) always use the MAIN back
// camera — never the 0.5× ultra-wide. Strategy:
//   1. Open any back camera once purely to unlock permission + device labels.
//   2. Rank all cameras WITHOUT opening them, using InputDeviceInfo
//      capabilities: main sensor has the highest max resolution (S22: 50 MP vs
//      12 MP ultra-wide), labels containing "wide/ultra" are demoted, and the
//      lowest Android camera index ("camera2 0, facing back") wins ties — on
//      virtually every Android phone camera 0 is the main back camera.
//   3. CRITICAL: stop the current stream BEFORE opening a candidate. Android
//      cannot open two cameras at once — probing while the first stream was
//      live is why earlier attempts silently stayed on the ultra-wide.
//   4. Apply 3× zoom when the zoom API exists; otherwise stay at the main
//      camera's native 1×.

const VIDEO_BASE: MediaTrackConstraints = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Parse the Android camera index from labels like "camera2 2, facing back". */
const parseCameraIndex = (label: string): number => {
  const m = label.match(/camera2?\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
};

const looksUltraWide = (label: string) => /ultra|wide|0[.,]5\s*x/i.test(label);

const looksFrontFacing = (label: string, caps: any) => {
  if (Array.isArray(caps?.facingMode) && caps.facingMode.includes("user")) return true;
  return /front|user|selfie/i.test(label);
};

const looksBackFacing = (label: string, caps: any) => {
  if (Array.isArray(caps?.facingMode) && caps.facingMode.includes("environment")) return true;
  return /back|rear|environment/i.test(label);
};

interface RankedCamera {
  deviceId: string;
  label: string;
  index: number;
  megapixels: number;
  wide: boolean;
}

/** Rank candidate back cameras best-first without opening any of them. */
const rankBackCameras = (devices: MediaDeviceInfo[]): RankedCamera[] => {
  const cams = devices
    .filter((d) => d.kind === "videoinput")
    .map((d) => {
      let caps: any = {};
      try {
        caps = (d as any).getCapabilities?.() ?? {};
      } catch {
        /* not supported — rank on label alone */
      }
      const label = d.label || "";
      return {
        deviceId: d.deviceId,
        label,
        index: parseCameraIndex(label),
        megapixels: (caps?.width?.max ?? 0) * (caps?.height?.max ?? 0),
        wide: looksUltraWide(label),
        back: looksBackFacing(label, caps),
        front: looksFrontFacing(label, caps),
      };
    })
    .filter((c) => !c.front);

  const back = cams.filter((c) => c.back);
  const pool = back.length ? back : cams;

  return pool.sort((a, b) => {
    if (a.wide !== b.wide) return a.wide ? 1 : -1; // non-wide lenses first
    if (a.megapixels !== b.megapixels) return b.megapixels - a.megapixels; // main sensor = highest res
    return a.index - b.index; // camera 0 = main back camera on Android
  });
};

/** Ultra-wide check on a LIVE track (zoom.min < 1 or a tell-tale label). */
const trackIsUltraWide = (track: MediaStreamTrack | undefined): boolean => {
  if (!track) return false;
  try {
    const caps = (track.getCapabilities as any)?.() as any;
    if (caps?.zoom?.min != null && caps.zoom.min < 0.9) return true;
  } catch {
    /* capabilities unavailable */
  }
  return looksUltraWide(track.label || "");
};

/** Open a specific camera, retrying — Android needs time to release the previous one. */
const openCamera = async (deviceId: string): Promise<MediaStream | null> => {
  for (const delay of [0, 250, 600]) {
    if (delay) await sleep(delay);
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { ...VIDEO_BASE, deviceId: { exact: deviceId } },
        audio: false,
      });
    } catch {
      /* camera busy or blocked — retry after a pause */
    }
  }
  return null;
};

/**
 * Real QR scanning using the device's main rear camera. Frames are grabbed
 * from the video element and decoded with jsQR each animation frame. If the
 * camera is unavailable (permissions, no device, sandboxed preview) it falls
 * back to manual entry.
 */
export function QrScanner({ label, onScan }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  // Keep the latest onScan without making it an effect dependency — otherwise a
  // new inline callback from the parent would tear down and restart the camera.
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [manualValue, setManualValue] = useState("");
  // Shown under the scanning label so it's verifiable WHICH lens is active.
  const [cameraLabel, setCameraLabel] = useState<string | null>(null);

  /** Stop the RAF loop and release the camera. Safe to call multiple times. */
  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    doneRef.current = false;
    let cancelled = false;

    const finish = (text: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      stopCamera();
      onScanRef.current(text);
    };

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || doneRef.current || cancelled) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w && h) {
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
            if (code && code.data) {
              finish(code.data.trim());
              return;
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    async function start() {
      try {
        // Step 1 — open any environment camera to unlock permission + labels.
        // On Samsung phones this often lands on the 0.5× ultra-wide, which is
        // exactly why we re-select explicitly below instead of trusting it.
        let stream: MediaStream | null = await navigator.mediaDevices.getUserMedia({
          video: { ...VIDEO_BASE, facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (cancelled || doneRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // Step 2 — rank cameras (no opens needed) and switch if a better one exists.
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const ranked = rankBackCameras(devices);
          const currentTrack = stream.getVideoTracks()[0];
          const currentId = currentTrack?.getSettings().deviceId;
          const currentIsBest =
            ranked.length > 0 && ranked[0].deviceId === currentId;

          if (ranked.length && (!currentIsBest || trackIsUltraWide(currentTrack))) {
            // Release the current camera BEFORE opening another — Android
            // cannot hold two cameras open and would reject every candidate.
            stream.getTracks().forEach((t) => t.stop());
            stream = null;

            for (const cand of ranked) {
              if (cancelled || doneRef.current) return;
              if (!cand.deviceId) continue;

              const candidateStream = await openCamera(cand.deviceId);
              if (!candidateStream) continue;

              if (cancelled || doneRef.current) {
                candidateStream.getTracks().forEach((t) => t.stop());
                return;
              }

              const t = candidateStream.getVideoTracks()[0];
              if (trackIsUltraWide(t)) {
                candidateStream.getTracks().forEach((tr) => tr.stop());
                await sleep(150); // let the HAL release before the next open
                continue;
              }

              stream = candidateStream;
              break;
            }
          }
        } catch {
          /* enumeration failed — fall through to the fallback below */
        }

        // Fallback — if selection stopped the stream and nothing better opened,
        // reopen the default environment camera rather than showing nothing.
        if (!stream) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { ...VIDEO_BASE, facingMode: { ideal: "environment" } },
            audio: false,
          });
        }

        // Step 3 — request 3× zoom. If the zoom API is unavailable (some
        // Android WebViews), the camera stays at its native 1× — acceptable,
        // as long as it is the MAIN lens and not the ultra-wide.
        try {
          const track = stream.getVideoTracks()[0];
          const caps = (track?.getCapabilities as any)?.() as any;
          if (caps?.zoom?.max != null) {
            const target = Math.max(1, Math.min(3, caps.zoom.max));
            await (track as any).applyConstraints({ advanced: [{ zoom: target }] });
          }
        } catch {
          /* zoom not supported — stay at 1× */
        }

        if (cancelled || doneRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        setCameraLabel(stream.getVideoTracks()[0]?.label || null);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (cancelled) return;
        setError("Camera unavailable. Enter the ID manually.");
        setManual(true);
      }
    }

    start();
    return () => {
      cancelled = true;
      doneRef.current = true;
      stopCamera();
    };
  }, [stopCamera]);

  const goManual = () => {
    stopCamera();
    setManual(true);
  };

  const submitManual = () => {
    const v = manualValue.trim();
    if (v && !doneRef.current) {
      doneRef.current = true;
      onScanRef.current(v);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="relative w-64 h-64 bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white bg-slate-800">
            <Camera className="w-12 h-12 opacity-40" />
            <p className="text-xs opacity-70">{error}</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Reticle */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-40 h-40 border-2 border-white/70 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
            <div className="absolute top-0 left-0 right-0 h-1 bg-primary/80 shadow-[0_0_20px_rgba(58,174,82,0.6)] animate-scan" />
            <div className="absolute bottom-3 left-0 right-0 text-center">
              <p className="text-white/80 text-[10px] font-mono tracking-widest uppercase">{label}</p>
              {cameraLabel && (
                <p className="text-white/40 text-[9px] font-mono mt-0.5 truncate px-3">
                  {cameraLabel}
                </p>
              )}
            </div>
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {manual ? (
        <div className="w-full max-w-xs space-y-3">
          <input
            type="text"
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitManual()}
            placeholder="Enter ID"
            autoFocus
            className="w-full h-12 px-4 rounded-xl border-2 border-border bg-card text-center text-lg font-mono focus:border-primary outline-none"
            data-testid="input-manual-id"
          />
          <button
            onClick={submitManual}
            disabled={!manualValue.trim()}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50"
            data-testid="button-manual-confirm"
          >
            Confirm
          </button>
        </div>
      ) : (
        <button
          onClick={goManual}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-enter-manually"
        >
          <Keyboard className="w-4 h-4" />
          Enter ID manually
        </button>
      )}
    </div>
  );
}
