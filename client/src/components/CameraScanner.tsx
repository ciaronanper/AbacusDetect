import React, { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";

interface CameraScannerProps {
  label: string;
  onScan: () => void;
  countdownSeconds?: number;
}

export function CameraScanner({ label, onScan, countdownSeconds = 3 }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(countdownSeconds);
  const streamRef = useRef<MediaStream | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        setError("Unable to access front camera. Please check permissions.");
      }
    }

    startCamera();

    const interval = setInterval(() => {
      setCountdown((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(interval);
          if (!doneRef.current) {
            doneRef.current = true;
            onScan();
          }
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return (
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
            className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-24 h-24 rounded-full bg-black/50 border-4 border-white/70 flex items-center justify-center shadow-lg">
              <span className="text-white text-5xl font-bold tabular-nums">{countdown}</span>
            </div>
          </div>
          <div className="absolute top-0 left-0 right-0 h-1 bg-primary/80 shadow-[0_0_20px_rgba(58,174,82,0.6)] animate-scan" />
          <div className="absolute bottom-4 left-0 right-0 text-center">
            <p className="text-white/80 text-[10px] font-mono tracking-widest uppercase">{label}</p>
          </div>
        </>
      )}
    </div>
  );
}
