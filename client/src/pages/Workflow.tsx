import React, { useState, useEffect, useRef } from "react";
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
  Activity,
  Calendar,
  Clock,
  Thermometer,
  Heart,
  Wind,
  Loader2,
  Mic,
  MicOff,
  Bot,
  ArrowLeft
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ActionButton } from "@/components/ActionButton";
import { StatusCard } from "@/components/StatusCard";
import { Header } from "@/components/Header";
import { CameraScanner } from "@/components/CameraScanner";
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
  | "nurse-id-input"
  | "nurse-confirm"
  | "patient-scan"
  | "patient-confirm"
  | "vitals-choice"
  | "vitals-manual"
  | "vitals-auto"
  | "vitals-confirm"
  | "insert-cartridge"
  | "apply-sample"
  | "test-progress"
  | "test-complete"
  | "results"
  | "cleo"
  | "uploading"
  | "upload-confirm"
  ;

interface TestResult {
  saa2: number;
  level: string;
  interpretation: string;
}

interface Vitals {
  temperature: string;
  spO2: string;
  respiratoryRate: string;
}

// === CONSTANTS ===
const generatePatientId = () => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const l1 = letters[Math.floor(Math.random() * 26)];
  const l2 = letters[Math.floor(Math.random() * 26)];
  const num = Math.floor(100 + Math.random() * 900); // 100-999
  return `${l1}${l2}${num}`;
};

const generateNurseId = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
};

const MOCK_PATIENT = generatePatientId();
const TEST_DURATION_SECONDS = 300; // 5 minutes
const SCAN_DURATION_MS = 5000;

export default function Workflow() {
  const [step, setStep] = useState<Step>("home");
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState<TestResult | null>(null);
  const [nurseIdInput, setNurseIdInput] = useState("");
  const [confirmedNurseId, setConfirmedNurseId] = useState("");
  const [nurseAuthMethod, setNurseAuthMethod] = useState<"scan" | "input">("scan");
  const [resultDateTime, setResultDateTime] = useState<Date | null>(null);
  const [vitals, setVitals] = useState<Vitals>({ temperature: "", spO2: "", respiratoryRate: "" });
  const [cleoTranscript, setCleoTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const { toast } = useToast();
  const createResult = useCreateResult();

  // === HELPERS ===
  const generateResult = (): TestResult => {
    // 30% Very Low (<10), 20% Low (10–49), 20% Moderate (50–200), 15% High (201–300), 15% Very High (>300)
    const r = Math.random();
    const saa2 =
      r < 0.30 ? Math.floor(Math.random() * 10) :
      r < 0.50 ? Math.floor(10 + Math.random() * 40) :
      r < 0.70 ? Math.floor(50 + Math.random() * 151) :
      r < 0.85 ? Math.floor(201 + Math.random() * 100) :
                 Math.floor(301 + Math.random() * 300);

    let level = "";
    let interpretation = "";
    if (saa2 < 10) {
      level = "Very Low";
      interpretation = "Very low probability of SBI";
    } else if (saa2 < 50) {
      level = "Low";
      interpretation = "Low probability of SBI";
    } else if (saa2 <= 200) {
      level = "Moderate";
      interpretation = "Moderate probability of SBI";
    } else if (saa2 <= 300) {
      level = "High";
      interpretation = "High probability of SBI";
    } else {
      level = "Very High";
      interpretation = "Very high probability of SBI";
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
        setStep("nurse-auth-choice");
      }, 2500);
    } else if (step === "vitals-auto") {
      // Automated vitals gathering (3s)
      timer = setTimeout(() => {
        setVitals(generateRandomVitals());
        setStep("vitals-confirm");
      }, 3000);
    } else if (step === "test-complete") {
      // Step 10: Complete (5s) -> Results
      timer = setTimeout(() => {
        const newResult = generateResult();
        setResult(newResult);
        setResultDateTime(new Date());
        
        // Optimistically save result
        createResult.mutate({
          nurseId: confirmedNurseId,
          patientId: MOCK_PATIENT,
          saa2Value: newResult.saa2,
          level: newResult.level,
          interpretation: newResult.interpretation
        });

        setStep("results");
      }, 5000);
    } else if (step === "uploading") {
      // Uploading to EHR (2.5s)
      timer = setTimeout(() => {
        setStep("upload-confirm");
      }, 2500);
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


  // === HELPERS ===
  const generateRandomVitals = (): Vitals => {
    const temp = (96 + Math.random() * 6).toFixed(1); // 96.0 - 102.0 F
    const spO2 = Math.floor(88 + Math.random() * 12).toString(); // 88-99%
    const respRate = Math.floor(12 + Math.random() * 12).toString(); // 12-23 breaths/min
    return { temperature: temp, spO2, respiratoryRate: respRate };
  };

  // === HANDLERS ===
  const startWorkflow = () => setStep("nurse-auth-choice");
  const restartWorkflow = () => {
    setStep("home");
    setResult(null);
    setTimeLeft(0);
    setVitals({ temperature: "", spO2: "", respiratoryRate: "" });
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
              description="Establishing secure link to Electronic Health Record System"
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
              <ActionButton variant="outline" fullWidth onClick={() => setStep("nurse-scan")}>
                <ScanLine className="w-5 h-5 mr-2" />
                Scan Nurse QR
              </ActionButton>
              <ActionButton variant="outline" fullWidth onClick={() => setStep("nurse-id-input")}>
                Input Nurse ID number
              </ActionButton>
            </div>
          </div>
        );

      case "nurse-scan":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-8 max-w-sm mx-auto">
            <CameraScanner
              label="Scanning Nurse ID"
              countdownSeconds={3}
              onScan={() => {
                setNurseAuthMethod("scan");
                setConfirmedNurseId(generateNurseId());
                setStep("nurse-confirm");
              }}
            />
            <StatusCard
              icon={User}
              title="Scan Nurse ID"
              description="Hold your ID badge to the front camera"
            />
          </div>
        );

      case "nurse-id-input":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-8 max-w-sm mx-auto">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-display font-bold">Nurse ID Entry</h2>
              <p className="text-muted-foreground">Please enter your 6-digit staff number</p>
            </div>

            <label className="p-6 rounded-3xl border-4 border-primary shadow-2xl bg-card/50 cursor-text">
              <div className="flex justify-center gap-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className={`w-10 h-14 bg-card border-2 rounded-xl flex items-center justify-center ${i === nurseIdInput.length ? "border-primary" : "border-border"}`}>
                    <span className="text-2xl font-mono font-bold text-foreground">
                      {nurseIdInput[i] || ""}
                    </span>
                  </div>
                ))}
              </div>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={nurseIdInput}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setNurseIdInput(value);
                }}
                autoFocus
                className="sr-only"
                data-testid="input-nurse-id"
              />
            </label>

            <div className="w-full space-y-4 pt-8">
              <ActionButton 
                fullWidth 
                onClick={() => {
                  setNurseAuthMethod("input");
                  setConfirmedNurseId(nurseIdInput);
                  setStep("nurse-confirm");
                }}
                disabled={nurseIdInput.length !== 6}
              >
                Confirm Identity
              </ActionButton>
              <ActionButton variant="outline" fullWidth onClick={() => { setNurseIdInput(""); setStep("nurse-auth-choice"); }}>
                Back
              </ActionButton>
            </div>
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
              <span className="text-sm text-muted-foreground uppercase tracking-wider font-bold">Nurse ID</span>
              <p className="text-2xl font-mono font-bold text-foreground mt-1">{confirmedNurseId}</p>
            </div>

            <div className="w-full grid grid-cols-2 gap-4 pt-4">
              <ActionButton variant="outline" onClick={() => {
                if (nurseAuthMethod === "input") {
                  setNurseIdInput("");
                  setStep("nurse-id-input");
                } else {
                  setStep("nurse-scan");
                }
              }} data-testid="button-nurse-retry">Retry</ActionButton>
              <ActionButton variant="primary" onClick={() => setStep("patient-scan")} data-testid="button-nurse-confirm">Confirm</ActionButton>
            </div>
          </div>
        );

      case "patient-scan":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-8 max-w-sm mx-auto">
            <CameraScanner
              label="Scanning Patient Wristband"
              countdownSeconds={3}
              onScan={() => setStep("patient-confirm")}
            />
            <StatusCard
              icon={User}
              title="Scan Patient ID"
              description="Point camera at patient wristband"
            />
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

            <div className="w-full grid grid-cols-2 gap-4 pt-4">
              <ActionButton variant="outline" onClick={() => setStep("patient-scan")} data-testid="button-patient-retry">Retry</ActionButton>
              <ActionButton variant="primary" onClick={() => setStep("vitals-choice")} data-testid="button-patient-confirm">Confirm</ActionButton>
            </div>
          </div>
        );

      case "vitals-choice":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-8 max-w-sm mx-auto">
            <StatusCard 
              icon={Activity}
              title="Retrieving Vitals"
              description="Choose how to capture patient vital signs"
            />
            
            <div className="w-full space-y-4">
              <ActionButton variant="outline" fullWidth onClick={() => setStep("vitals-manual")} data-testid="button-vitals-manual">
                <Thermometer className="w-5 h-5 mr-2" />
                Manual Entry
              </ActionButton>
              <ActionButton variant="outline" fullWidth onClick={() => setStep("vitals-auto")} data-testid="button-vitals-auto">
                <Activity className="w-5 h-5 mr-2" />
                Automated Entry
              </ActionButton>
            </div>
          </div>
        );

      case "vitals-manual":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <StatusCard 
              icon={Thermometer}
              title="Enter Vitals"
              description="Please enter the patient's vital signs"
            />
            
            <div className="w-full space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Thermometer className="w-4 h-4 text-primary" />
                  Temperature (°F)
                </label>
                <Input
                  type="number"
                  step="0.1"
                  min="90"
                  max="110"
                  placeholder="98.6"
                  value={vitals.temperature}
                  onChange={(e) => setVitals({ ...vitals, temperature: e.target.value })}
                  data-testid="input-temperature"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Heart className="w-4 h-4 text-primary" />
                  Blood Oxygen (SpO₂ %)
                </label>
                <Input
                  type="number"
                  min="70"
                  max="100"
                  placeholder="98"
                  value={vitals.spO2}
                  onChange={(e) => setVitals({ ...vitals, spO2: e.target.value })}
                  data-testid="input-spo2"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Wind className="w-4 h-4 text-primary" />
                  Respiratory Rate (breaths/min)
                </label>
                <Input
                  type="number"
                  min="8"
                  max="40"
                  placeholder="16"
                  value={vitals.respiratoryRate}
                  onChange={(e) => setVitals({ ...vitals, respiratoryRate: e.target.value })}
                  data-testid="input-respiratory-rate"
                />
              </div>
            </div>

            <div className="w-full space-y-4 pt-4">
              <ActionButton 
                fullWidth 
                onClick={() => setStep("insert-cartridge")}
                disabled={!vitals.temperature || !vitals.spO2 || !vitals.respiratoryRate}
                data-testid="button-vitals-continue"
              >
                Continue <ChevronRight className="w-5 h-5 ml-1" />
              </ActionButton>
              <ActionButton variant="outline" fullWidth onClick={() => setStep("vitals-choice")} data-testid="button-vitals-back">
                Back
              </ActionButton>
            </div>
          </div>
        );

      case "vitals-auto":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-8 max-w-sm mx-auto">
            <div className="w-32 h-32 bg-primary/10 rounded-full flex items-center justify-center">
              <Loader2 className="w-16 h-16 text-primary animate-spin" />
            </div>

            <StatusCard 
              icon={Activity}
              title="Gathering Vitals"
              description="Automatically retrieving patient vital signs..."
              status="processing"
            />

            <div className="w-full max-w-xs bg-secondary/50 rounded-full h-2 overflow-hidden">
              <motion.div 
                className="h-full bg-primary"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 3, ease: "linear" }}
              />
            </div>
          </div>
        );

      case "vitals-confirm":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <StatusCard 
              icon={Activity}
              title="Vitals Retrieved"
              description="Please verify the captured vital signs"
              status="success"
            />
            
            <div className="w-full bg-card border border-border rounded-2xl p-6 shadow-sm">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground">
                    <Thermometer className="w-4 h-4" />
                    <span className="text-xs font-medium">Temp</span>
                  </div>
                  <p className="text-2xl font-mono font-bold" data-testid="text-confirm-temperature">{vitals.temperature}°F</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground">
                    <Heart className="w-4 h-4" />
                    <span className="text-xs font-medium">SpO₂</span>
                  </div>
                  <p className="text-2xl font-mono font-bold" data-testid="text-confirm-spo2">{vitals.spO2}%</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground">
                    <Wind className="w-4 h-4" />
                    <span className="text-xs font-medium">Resp</span>
                  </div>
                  <p className="text-2xl font-mono font-bold" data-testid="text-confirm-respiratory">{vitals.respiratoryRate}</p>
                </div>
              </div>
            </div>

            <div className="w-full space-y-4 pt-4">
              <p className="text-center font-medium">Correct vitals?</p>
              <div className="grid grid-cols-2 gap-4">
                <ActionButton variant="outline" onClick={() => { setVitals({ temperature: "", spO2: "", respiratoryRate: "" }); setStep("vitals-choice"); }} data-testid="button-vitals-confirm-no">No</ActionButton>
                <ActionButton variant="primary" onClick={() => setStep("insert-cartridge")} data-testid="button-vitals-confirm-yes">Yes</ActionButton>
              </div>
            </div>
          </div>
        );

      case "insert-cartridge":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-8 max-w-sm mx-auto">
            <div className="text-center">
              <img src={logoPng} alt="Abacus Labs" className="h-40 w-auto mx-auto object-contain" />
            </div>

            <StatusCard 
              icon={TestTube2}
              title="Insert Cartridge"
              description="Please insert SAA2 cartridge into reader port"
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
              description="Apply 4 drops to cartridge well"
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
                Skip Timer
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
        
        // 5-band SAA2 classification
        type Band = { label: string; text: string; bg: string; border: string; textColor: string; badgeColor: string };
        const band: Band =
          result.saa2 < 10   ? { label: "Very Low",  text: "Very low probability of SBI",  bg: "bg-green-50",  border: "border-green-200",  textColor: "text-green-900",  badgeColor: "bg-green-800"  } :
          result.saa2 < 50   ? { label: "Low",        text: "Low probability of SBI",        bg: "bg-green-50",  border: "border-green-200",  textColor: "text-green-700",  badgeColor: "bg-green-500"  } :
          result.saa2 <= 200 ? { label: "Moderate",   text: "Moderate probability of SBI",   bg: "bg-yellow-50", border: "border-yellow-200", textColor: "text-yellow-700", badgeColor: "bg-yellow-500" } :
          result.saa2 <= 300 ? { label: "High",       text: "High probability of SBI",       bg: "bg-orange-50", border: "border-orange-200", textColor: "text-orange-700", badgeColor: "bg-orange-500" } :
                               { label: "Very High",  text: "Very high probability of SBI",  bg: "bg-red-50",    border: "border-red-200",    textColor: "text-red-700",    badgeColor: "bg-red-500"    };

        // 5-band gauge pin: each band occupies 20% of the bar width
        const gaugePinPct = (() => {
          const s = result.saa2;
          if (s < 10)   return (s / 10) * 20;
          if (s < 50)   return 20 + ((s - 10) / 40) * 20;
          if (s <= 200) return 40 + ((s - 50) / 150) * 20;
          if (s <= 300) return 60 + ((s - 200) / 100) * 20;
          return 80 + Math.min((s - 300) / 300, 1) * 20;
        })();
        const pinLeft = `clamp(12px, calc(${gaugePinPct}% - 12px), calc(100% - 12px))`;

        return (
          <div className="flex flex-col h-full max-w-sm mx-auto">
            <div className="flex-1 overflow-y-auto pb-4 space-y-3">

              {/* Patient info header */}
              <div className="bg-muted/60 border border-border rounded-xl px-3 py-2 flex items-center justify-between text-xs text-muted-foreground" data-testid="card-patient-info-header">
                <div>
                  <span className="uppercase tracking-wide block">Patient ID</span>
                  <span className="font-bold text-foreground">{MOCK_PATIENT}</span>
                </div>
                <div className="text-center">
                  <span className="uppercase tracking-wide block">Nurse</span>
                  <span className="font-bold text-foreground">{confirmedNurseId}</span>
                </div>
                {resultDateTime && (
                  <div className="text-right">
                    <span className="block">{resultDateTime.toLocaleDateString()}</span>
                    <span>{resultDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )}
              </div>

              {/* Probability card */}
              <div className={cn("p-4 rounded-xl border-2 text-center", band.bg, band.border)} data-testid="card-probability">
                <span className="text-xs font-bold uppercase opacity-60 block mb-2">Probability of SBI</span>
                <span className={cn("inline-block text-xl font-bold px-5 py-1.5 rounded-full text-white", band.badgeColor)} data-testid="text-sbi-probability">{band.label}</span>
              </div>

              {/* SAA2 level card */}
              <div className={cn("p-4 rounded-xl border-2 text-center", band.bg, band.border)} data-testid="card-saa2-level">
                <span className="text-xs font-bold uppercase opacity-60 block">SAA2 Level</span>
                <p className={cn("text-3xl font-bold mt-1 tabular-nums", band.textColor)} data-testid="text-saa2-value">
                  {result.saa2} <span className="text-base font-normal">mg/L</span>
                </p>
              </div>

              {/* SAA2 gauge — 5 equal bands */}
              <div className="bg-card border border-border rounded-xl p-4 shadow-sm" data-testid="card-severity-gauge">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">SAA2 Range</span>
                  <span className={cn("text-xs font-bold px-2 py-0.5 rounded text-white", band.badgeColor)}>
                    {result.saa2 < 10 ? "Zone 5" : result.saa2 < 50 ? "Zone 4" : result.saa2 <= 200 ? "Zone 3" : result.saa2 <= 300 ? "Zone 2" : "Zone 1"}
                  </span>
                </div>
                <div className="relative px-1">
                  {/* Pin — arrow only */}
                  <div className="absolute bottom-[calc(100%-2px)] flex flex-col items-center" style={{ left: pinLeft }}>
                    <div className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[14px] border-t-gray-600" />
                  </div>
                  {/* 5-colour bar */}
                  <div className="mt-9 rounded-lg border border-gray-200 overflow-hidden">
                    <div className="flex h-5">
                      <div className="bg-green-800" style={{ width: "20%" }} />
                      <div className="bg-green-400" style={{ width: "20%" }} />
                      <div className="bg-yellow-400" style={{ width: "20%" }} />
                      <div className="bg-orange-400" style={{ width: "20%" }} />
                      <div className="bg-red-500"    style={{ width: "20%" }} />
                    </div>
                  </div>
                </div>
                {/* Boundary labels — positioned at each band transition */}
                <div className="relative h-5 mt-1">
                  {[
                    { label: "0",    pct: 0  },
                    { label: "10",   pct: 20 },
                    { label: "50",   pct: 40 },
                    { label: "200",  pct: 60 },
                    { label: "300+", pct: 80 },
                  ].map(({ label, pct }) => (
                    <span
                      key={label}
                      className="absolute text-xs text-muted-foreground"
                      style={{
                        left: `${pct}%`,
                        transform: pct === 0 ? "none" : "translateX(-50%)",
                      }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
                {/* Severity triangle — narrow at low end, wide at high end */}
                <div className="mt-2 w-full" style={{ height: "36px" }}>
                  <div style={{
                    width: "100%",
                    height: "100%",
                    clipPath: "polygon(0% 50%, 100% 0%, 100% 100%)",
                    background: "linear-gradient(to right, #166534, #4ade80, #facc15, #fb923c, #ef4444)",
                  }} />
                </div>
              </div>

              {/* Vitals */}
              {vitals.temperature && vitals.spO2 && vitals.respiratoryRate && (
                <div className="bg-card border border-border rounded-xl p-3 shadow-sm" data-testid="card-vitals">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">Patient Vitals</span>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground">
                        <Thermometer className="w-3 h-3" />
                        <span className="text-[10px]">Temp</span>
                      </div>
                      <p className="text-base font-mono font-bold">{vitals.temperature}°F</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground">
                        <Heart className="w-3 h-3" />
                        <span className="text-[10px]">SpO₂</span>
                      </div>
                      <p className="text-base font-mono font-bold">{vitals.spO2}%</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground">
                        <Wind className="w-3 h-3" />
                        <span className="text-[10px]">Resp</span>
                      </div>
                      <p className="text-base font-mono font-bold">{vitals.respiratoryRate}</p>
                    </div>
                  </div>
                </div>
              )}

              <ActionButton fullWidth variant="outline" onClick={() => setStep("uploading")} data-testid="button-upload-ehr">
                Upload Data to Health Record
              </ActionButton>
            </div>
          </div>
        );

      case "cleo":
        const startRecording = async () => {
          try {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (!SpeechRecognition) {
              toast({
                title: "Not Supported",
                description: "Voice recognition is not supported in this browser.",
                variant: "destructive"
              });
              return;
            }
            
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';
            
            recognition.onresult = (event: any) => {
              let transcript = '';
              for (let i = 0; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
              }
              setCleoTranscript(transcript);
            };
            
            recognition.onerror = () => {
              setIsRecording(false);
            };
            
            recognition.onend = () => {
              setIsRecording(false);
            };
            
            (window as any).currentRecognition = recognition;
            recognition.start();
            setIsRecording(true);
          } catch (error) {
            toast({
              title: "Error",
              description: "Could not start voice recognition.",
              variant: "destructive"
            });
          }
        };
        
        const stopRecording = () => {
          if ((window as any).currentRecognition) {
            (window as any).currentRecognition.stop();
          }
          setIsRecording(false);
        };
        
        return (
          <div className="flex flex-col h-full max-w-sm mx-auto pb-4">
            <div className="flex-1 flex flex-col items-center justify-center gap-6 pt-4">
              <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center">
                <Bot className="w-12 h-12 text-primary" />
              </div>
              
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-display font-bold">CLEO</h2>
                <p className="text-muted-foreground">
                  Hi, I'm CLEO, your virtual nurse. How can I help you today?
                </p>
              </div>
              
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                  isRecording 
                    ? "bg-red-500 animate-pulse" 
                    : "bg-primary hover:bg-primary/90"
                }`}
                data-testid="button-voice"
              >
                {isRecording ? (
                  <MicOff className="w-8 h-8 text-white" />
                ) : (
                  <Mic className="w-8 h-8 text-white" />
                )}
              </button>
              
              <p className="text-xs text-muted-foreground">
                {isRecording ? "Tap to stop recording" : "Tap to speak"}
              </p>
              
              {cleoTranscript && (
                <div className="w-full bg-card border border-border rounded-xl p-4 mt-4">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Your message:</p>
                  <p className="text-base" data-testid="text-transcript">{cleoTranscript}</p>
                </div>
              )}
            </div>
            
            <div className="pt-4">
              <ActionButton 
                fullWidth 
                variant="outline" 
                onClick={() => setStep("results")}
                data-testid="button-return-results"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Return to Results
              </ActionButton>
            </div>
          </div>
        );

      case "uploading":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-8 max-w-sm mx-auto">
            <StatusCard 
              icon={Activity}
              title="Connecting..."
              description="Establishing secure link to Electronic Health Record System"
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

      case "upload-confirm":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-8 max-w-sm mx-auto">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-32 h-32 bg-green-100 rounded-full flex items-center justify-center text-green-600"
            >
              <CheckCircle2 className="w-16 h-16" />
            </motion.div>
            
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-display font-bold">Data Uploaded</h2>
              <p className="text-muted-foreground">Successfully uploaded to Electronic Health Record</p>
            </div>

            <div className="w-full pt-8">
              <ActionButton fullWidth onClick={restartWorkflow} data-testid="button-confirm-upload">
                Confirm Data Upload
              </ActionButton>
            </div>
          </div>
        );

    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <Header onLogoClick={restartWorkflow} />
      
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
