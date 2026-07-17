import React, { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, Keyboard } from "lucide-react";

interface QrScannerProps {
  label: string;
  /** Called once with the decoded QR text (or manually entered value). */
  onScan: (text: string) => void;
}

/**
 * Real QR scanning using the device's rear ("environment") camera. Frames are
 * grabbed from the video element and decoded with jsQR each animation frame.
 * If the camera is unavailable (permissions, no device, sandboxed preview) it
 * falls back to manual entry.
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
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        // Component unmounted (or scan finished) while awaiting permission.
        if (cancelled || doneRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // Apply 3× zoom on the main rear camera. This also avoids the
        // ultra-wide (0.5×) lens — any zoom > 1 forces the main sensor.
        const track = stream.getVideoTracks()[0];
        if (track) {
          try {
            const capabilities = (track.getCapabilities as any)?.() as any;
            if (capabilities?.zoom) {
              const max = capabilities.zoom.max ?? 1;
              const target = Math.min(3, max);
              await track.applyConstraints({ advanced: [{ zoom: target } as any] });
            }
          } catch {
            // zoom not supported on this device — continue without it
          }
        }

        streamRef.current = stream;
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
            <div className="absolute bottom-4 left-0 right-0 text-center">
              <p className="text-white/80 text-[10px] font-mono tracking-widest uppercase">{label}</p>
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
