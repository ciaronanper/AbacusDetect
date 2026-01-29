import { useEffect, useRef, useState } from "react";
import { Camera, ScanLine } from "lucide-react";

interface QRScannerProps {
  label: string;
  onScan: () => void;
  overlayImage?: string;
}

export function QRScanner({ label, onScan, overlayImage }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (overlayImage) return; // Don't start camera if we have an overlay image

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: "user" } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
        setError("Unable to access front camera.");
      }
    }

    startCamera();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => {
          track.stop();
          console.log(`Stopped QR track: ${track.label}`);
        });
      }
    };
  }, [overlayImage]);

  return (
    <div className="relative w-64 h-64 bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800">
      {error && !overlayImage ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white bg-slate-800">
          <Camera className="w-12 h-12 mb-2 opacity-50" />
          <p className="text-xs">{error}</p>
        </div>
      ) : (
        <>
          {overlayImage ? (
            <img 
              src={overlayImage} 
              alt="Scan Area" 
              className="absolute inset-0 w-full h-full object-cover" 
            />
          ) : (
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <ScanLine className="w-12 h-12 text-white/20" />
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
