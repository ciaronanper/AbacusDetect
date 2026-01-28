import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Power, 
  ScanLine, 
  CheckCircle2, 
  User, 
  UserCheck, 
  Syringe, 
  TestTube2, 
  Timer,
  ChevronRight,
  RotateCcw,
  AlertCircle,
  Activity
} from "lucide-react";
import { ActionButton } from "@/components/ActionButton";
import { StatusCard } from "@/components/StatusCard";
import { Header } from "@/components/Header";
import { FaceDetection } from "@/components/FaceDetection";
import { QRScanner } from "@/components/QRScanner";
import { useCreateResult } from "@/hooks/use-results";
import { useToast } from "@/hooks/use-toast";
import logoPng from "@assets/Vertical_logo_bgtransparent_1769613129480.png";

// === TYPES ===
type Step = 
  | "home"
  | "connecting"
  | "nurse-auth-choice"
  | "nurse-face-id"
  | "nurse-scan"
  | "nurse-confirm"
  | "patient-scan"
  | "patient-confirm"
  | "insert-cartridge"
  | "apply-sample"
  | "test-progress"
  | "test-complete"
  | "results";

interface TestResult {
  saa2: number;
  level: string;
  interpretation: string;
}

// === CONSTANTS ===
const MOCK_NURSE = "Jane Doe";
const MOCK_PATIENT = "XU274";
const TEST_DURATION_SECONDS = 300; // 5 minutes
const SCAN_DURATION_MS = 5000;

export default function Workflow() {
  const [step, setStep] = useState<Step>("home");
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState<TestResult | null>(null);
  const { toast } = useToast();
  const createResult = useCreateResult();

  // === HELPERS ===
  const generateResult = (): TestResult => {
    const saa2 = Math.floor(Math.random() * 501); // 0-500
    let level = "";
    let interpretation = "";

    if (saa2 < 10) {
      level = "Normal";
      interpretation = "No significant inflammation";
    } else if (saa2 <= 50) {
      level = "Mild";
      interpretation = "Mild infection or inflammation";
    } else if (saa2 <= 100) {
      level = "Moderate";
      interpretation = "Moderate inflammation, possible bacterial infection";
    } else if (saa2 <= 200) {
      level = "High";
      interpretation = "Significant inflammation, likely bacterial infection";
    } else {
      level = "Severe";
      interpretation = "Severe infection or systematic inflammation - Sepsis Risk";
    }

    return { saa2, level, interpretation };
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // === EFFECTS FOR AUTO-ADVANCE ===
  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (step === "connecting") {
      // Step 2a: Connecting (2.5s) -> Nurse Auth Choice
      timer = setTimeout(() => {
        toast({ title: "Connected", description: "System link established." });
        setStep("nurse-auth-choice");
      }, 2500);
    } else if (step === "nurse-scan") {
      // Step 3: Nurse Scan (5s) -> Nurse Confirm
      timer = setTimeout(() => setStep("nurse-confirm"), SCAN_DURATION_MS);
    } else if (step === "patient-scan") {
      // Step 5: Patient Scan (5s) -> Patient Confirm
      timer = setTimeout(() => setStep("patient-confirm"), SCAN_DURATION_MS);
    } else if (step === "test-complete") {
      // Step 10: Complete (5s) -> Results
      timer = setTimeout(() => {
        const newResult = generateResult();
        setResult(newResult);
        
        // Optimistically save result
        createResult.mutate({
          nurseId: MOCK_NURSE,
          patientId: MOCK_PATIENT,
          saa2Value: newResult.saa2,
          level: newResult.level,
          interpretation: newResult.interpretation
        });

        setStep("results");
      }, 5000);
    }

    return () => clearTimeout(timer);
  }, [step, toast, createResult]);

  // === TIMER EFFECT ===
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (step === "test-progress" && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (step === "test-progress" && timeLeft === 0) {
      setStep("test-complete");
    }
    return () => clearInterval(interval);
  }, [step, timeLeft]);


  // === HANDLERS ===
  const startWorkflow = () => setStep("connecting");
  const restartWorkflow = () => {
    setStep("home");
    setResult(null);
    setTimeLeft(0);
  };

  const startTest = () => {
    setTimeLeft(TEST_DURATION_SECONDS);
    setStep("test-progress");
  };

  const skipTimer = () => setTimeLeft(0); // Triggers effect to go to complete

  // === RENDER STEP CONTENT ===
  const renderContent = () => {
    switch (step) {
      case "home":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-8">
            <div className="text-center space-y-4">
              <img src={logoPng} alt="Abacus Labs" className="h-40 w-auto mx-auto object-contain" />
              <p className="text-muted-foreground font-medium tracking-wide">SAA2 Reader System</p>
            </div>
            
            <button 
              onClick={startWorkflow}
              className="group relative flex items-center justify-center w-40 h-40 rounded-full bg-white shadow-xl shadow-primary/5 border-4 border-slate-50 active:scale-95 transition-all duration-300"
            >
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-primary/5 to-white opacity-50" />
              <Power className="w-16 h-16 text-primary group-hover:scale-110 transition-transform relative z-10" />
              <span className="absolute -bottom-12 text-sm font-medium text-muted-foreground uppercase tracking-widest">
                Power On
              </span>
            </button>
          </div>
        );

      case "connecting":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-8 max-w-sm mx-auto">
            <StatusCard 
              icon={Activity}
              title="Connecting..."
              description="Establishing secure link to Epic Health Record System"
              status="processing"
            />
            <div className="w-full max-w-xs bg-secondary/50 rounded-full h-2 overflow-hidden">
              <motion.div 
                className="h-full bg-primary"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 2.5, ease: "linear" }}
              />
            </div>
          </div>
        );

      case "nurse-auth-choice":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-8 max-w-sm mx-auto">
            <StatusCard 
              icon={UserCheck}
              title="Nurse Authentication"
              description="Choose how you would like to verify your identity"
            />
            
            <div className="w-full space-y-4">
              <ActionButton fullWidth onClick={() => setStep("nurse-scan")}>
                <ScanLine className="w-5 h-5 mr-2" />
                Nurse QR Code
              </ActionButton>
              <ActionButton variant="outline" fullWidth onClick={() => setStep("nurse-face-id")}>
                <User className="w-5 h-5 mr-2" />
                Face ID
              </ActionButton>
            </div>
          </div>
        );

      case "nurse-face-id":
        return (
          <FaceDetection 
            onComplete={() => setStep("nurse-confirm")}
            onCancel={() => setStep("nurse-auth-choice")}
          />
        );

      case "nurse-scan":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-8 max-w-sm mx-auto">
            <QRScanner label="Scanning Nurse ID" onScan={() => setStep("nurse-confirm")} />
            
            <StatusCard 
              icon={User}
              title="Scan Nurse ID"
              description="Align barcode within the frame"
            />
            
            {/* Hidden debug button to skip wait */}
            <button onClick={() => setStep("nurse-confirm")} className="opacity-0 h-10">Skip</button>
          </div>
        );

      case "nurse-confirm":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <StatusCard 
              icon={UserCheck}
              title="Nurse Identified"
              description="Please verify identity"
              status="success"
            />
            
            <div className="w-full bg-card border border-border p-6 rounded-2xl shadow-sm text-center">
              <span className="text-sm text-muted-foreground uppercase tracking-wider font-bold">Nurse Name</span>
              <p className="text-2xl font-display font-bold text-foreground mt-1">{MOCK_NURSE}</p>
            </div>

            <div className="w-full space-y-4 pt-4">
              <p className="text-center font-medium">Correct ID?</p>
              <div className="grid grid-cols-2 gap-4">
                <ActionButton variant="outline" onClick={() => setStep("nurse-auth-choice")}>No</ActionButton>
                <ActionButton variant="primary" onClick={() => setStep("patient-scan")}>Yes</ActionButton>
              </div>
            </div>
          </div>
        );

      case "patient-scan":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-8 max-w-sm mx-auto">
            <QRScanner label="Scanning Patient ID" onScan={() => setStep("patient-confirm")} />
            
            <StatusCard 
              icon={User}
              title="Scan Patient ID"
              description="Align wristband barcode"
            />

             {/* Hidden debug button to skip wait */}
             <button onClick={() => setStep("patient-confirm")} className="opacity-0 h-10">Skip</button>
          </div>
        );

      case "patient-confirm":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <StatusCard 
              icon={UserCheck}
              title="Patient Identified"
              description="Please verify identity"
              status="success"
            />
            
            <div className="w-full bg-card border border-border p-6 rounded-2xl shadow-sm text-center">
              <span className="text-sm text-muted-foreground uppercase tracking-wider font-bold">Patient ID</span>
              <p className="text-2xl font-mono font-bold text-foreground mt-1">{MOCK_PATIENT}</p>
            </div>

            <div className="w-full space-y-4 pt-4">
              <p className="text-center font-medium">Correct ID?</p>
              <div className="grid grid-cols-2 gap-4">
                <ActionButton variant="outline" onClick={() => setStep("patient-scan")}>No</ActionButton>
                <ActionButton variant="primary" onClick={() => setStep("insert-cartridge")}>Yes</ActionButton>
              </div>
            </div>
          </div>
        );

      case "insert-cartridge":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-8 max-w-sm mx-auto">
            <div className="w-48 h-48 bg-blue-50 rounded-full flex items-center justify-center animate-pulse">
              <div className="w-32 h-40 bg-white border-2 border-primary/20 rounded-lg shadow-lg flex items-center justify-center">
                 <div className="w-20 h-2 bg-primary/20 rounded-full" />
              </div>
            </div>

            <StatusCard 
              icon={TestTube2}
              title="Insert Cartridge"
              description="Please insert SAA2 cartridge into reader slot"
            />

            <div className="w-full pt-8">
              <ActionButton fullWidth onClick={() => setStep("apply-sample")}>
                Next Step <ChevronRight className="w-5 h-5 ml-1" />
              </ActionButton>
            </div>
          </div>
        );

      case "apply-sample":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-8 max-w-sm mx-auto">
             <div className="w-48 h-48 bg-amber-50 rounded-full flex items-center justify-center">
              <Syringe className="w-24 h-24 text-amber-500 rotate-45" />
            </div>

            <StatusCard 
              icon={Syringe}
              title="Apply Sample"
              description="Apply 3 drops of patient sample to cartridge well"
              status="warning"
            />

            <div className="w-full pt-8">
              <ActionButton fullWidth onClick={startTest}>
                Start Analysis <ChevronRight className="w-5 h-5 ml-1" />
              </ActionButton>
            </div>
          </div>
        );

      case "test-progress":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-8 max-w-sm mx-auto">
            <div className="relative flex items-center justify-center">
              <svg className="w-64 h-64 transform -rotate-90">
                <circle
                  cx="128"
                  cy="128"
                  r="120"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-secondary"
                />
                <circle
                  cx="128"
                  cy="128"
                  r="120"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={2 * Math.PI * 120}
                  strokeDashoffset={2 * Math.PI * 120 * (1 - timeLeft / TEST_DURATION_SECONDS)}
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
              description="Sample detected. Do not remove cartridge."
              status="processing"
            />

            <div className="w-full pt-4">
              <ActionButton variant="ghost" fullWidth onClick={skipTimer} className="text-muted-foreground hover:text-foreground">
                Skip Timer (Debug)
              </ActionButton>
            </div>
          </div>
        );

      case "test-complete":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-8">
             <motion.div 
               initial={{ scale: 0.8, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               className="w-32 h-32 bg-green-100 rounded-full flex items-center justify-center text-green-600"
             >
               <CheckCircle2 className="w-16 h-16" />
             </motion.div>
             
             <div className="text-center space-y-2">
               <h2 className="text-2xl font-display font-bold">Test Complete</h2>
               <p className="text-muted-foreground">Generating report...</p>
             </div>
          </div>
        );

      case "results":
        if (!result) return null;
        
        const isHighRisk = result.saa2 > 100;
        
        return (
          <div className="flex flex-col h-full max-w-sm mx-auto pb-6">
            <div className="flex-1 space-y-6 pt-4">
              <div className="text-center space-y-1">
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">SAA2 Result</h2>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-6xl font-mono font-bold tracking-tighter">{result.saa2}</span>
                  <span className="text-xl font-medium text-muted-foreground">mg/L</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className={cn(
                  "p-6 rounded-2xl border-2 text-center",
                  isHighRisk ? "bg-red-50 border-red-100" : "bg-blue-50 border-blue-100"
                )}>
                  <span className="text-xs font-bold uppercase opacity-60 mb-1 block">Inflammation Level</span>
                  <p className={cn(
                    "text-2xl font-bold",
                    isHighRisk ? "text-red-700" : "text-blue-700"
                  )}>{result.level}</p>
                </div>

                <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-2">
                  <div className="flex items-start gap-3">
                    <AlertCircle className={cn("w-5 h-5 mt-0.5 shrink-0", isHighRisk ? "text-red-500" : "text-blue-500")} />
                    <div>
                      <span className="text-sm font-bold text-foreground block mb-1">Clinical Interpretation</span>
                      <p className="text-muted-foreground leading-relaxed">
                        {result.interpretation}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground pt-4 border-t border-border">
                  <div>
                    <span className="block font-bold">Patient</span>
                    <span className="font-mono">{MOCK_PATIENT}</span>
                  </div>
                  <div className="text-right">
                    <span className="block font-bold">Nurse</span>
                    <span>{MOCK_NURSE}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <ActionButton fullWidth variant="outline" onClick={restartWorkflow} className="border-primary/20 text-primary hover:bg-primary/5">
                <RotateCcw className="w-5 h-5 mr-2" />
                New Test
              </ActionButton>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <Header />
      
      <main className="flex-1 px-6 pt-20 pb-8 safe-area-pb overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
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
    </div>
  );
}

// Utility class merger (should be in utils but inline for single file if needed)
function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}
