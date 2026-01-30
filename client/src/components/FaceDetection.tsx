import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCcw, CheckCircle2 } from "lucide-react";
import { ActionButton } from "./ActionButton";

interface FaceDetectionProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function FaceDetection({ onComplete, onCancel }: FaceDetectionProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"initializing" | "ready" | "scanning" | "success">("initializing");

  useEffect(() => {
    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: "user" } 
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
        setStatus("ready");
      } catch (err) {
        console.error("Error accessing camera:", err);
        setError("Unable to access front camera. Please check permissions.");
      }
    }

    startCamera();

    return () => {
      console.log("Cleaning up FaceDetection camera stream");
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleScan = () => {
    setStatus("scanning");
    // Simulate biometric processing
    setTimeout(() => {
      setStatus("success");
      setTimeout(() => {
        onComplete();
      }, 1500);
    }, 3000);
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-sm mx-auto">
      <div className="relative w-64 h-64 rounded-full overflow-hidden border-4 border-primary shadow-2xl bg-slate-900">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white bg-slate-800">
            <Camera className="w-12 h-12 mb-2 opacity-50" />
            <p className="text-sm">{error}</p>
          </div>
        ) : (
          <>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className={`absolute inset-0 w-full h-full object-cover scale-x-[-1] ${status === "success" ? "opacity-50" : "opacity-100"}`}
            />
            
            {status === "scanning" && (
              <div className="absolute inset-0">
                <div className="absolute top-1/2 left-0 right-0 h-1 bg-primary/80 shadow-[0_0_20px_rgba(58,174,82,0.6)] animate-scan" />
                <div className="absolute inset-0 border-[20px] border-primary/20 rounded-full" />
              </div>
            )}

            {status === "success" && (
              <div className="absolute inset-0 flex items-center justify-center bg-primary/20 backdrop-blur-sm">
                <CheckCircle2 className="w-20 h-20 text-primary animate-in zoom-in duration-300" />
              </div>
            )}
          </>
        )}
      </div>

      <div className="text-center space-y-2">
        <h3 className="text-xl font-display font-bold">
          {status === "initializing" && "Initializing Camera..."}
          {status === "ready" && "Nurse Face ID Check"}
          {status === "scanning" && "Verifying Identity..."}
          {status === "success" && "Identity Verified"}
        </h3>
        <p className="text-muted-foreground text-sm">
          {status === "ready" && "Align your face within the circle"}
          {status === "scanning" && "Keep still for biometric verification"}
          {status === "success" && "Biometric match successful"}
        </p>
      </div>

      <div className="w-full space-y-3 pt-4">
        {status === "ready" && (
          <ActionButton fullWidth onClick={handleScan}>
            Start Face ID
          </ActionButton>
        )}
        
        {status === "scanning" && (
          <ActionButton fullWidth disabled className="opacity-70">
            <RefreshCcw className="w-4 h-4 mr-2 animate-spin" />
            Scanning...
          </ActionButton>
        )}

        {status !== "success" && (
          <ActionButton variant="outline" fullWidth onClick={onCancel}>
            Cancel
          </ActionButton>
        )}
      </div>
    </div>
  );
}
