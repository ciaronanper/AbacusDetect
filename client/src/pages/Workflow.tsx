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
import { QRScanner } from "@/components/QRScanner";
import { useCreateResult } from "@/hooks/use-results";
import { useToast } from "@/hooks/use-toast";
import logoPng from "@assets/Vertical_logo_bgtransparent_1769613129480.png";
import patientQr from "@assets/patientQR_1769614112153.webp";
import nurseQr from "@assets/Screenshot_2026-01-28_153006_1769614259203.png";

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
  | "local-save-confirm";

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
  const [resultNote, setResultNote] = useState("");
  const [resultDateTime, setResultDateTime] = useState<Date | null>(null);
  const [vitals, setVitals] = useState<Vitals>({ temperature: "", spO2: "", respiratoryRate: "" });
  const [cleoTranscript, setCleoTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [resultPage, setResultPage] = useState(0);
  const resultTouchStartX = useRef<number | null>(null);
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
        setStep("nurse-auth-choice");
      }, 2500);
    } else if (step === "nurse-scan") {
      // Step 3: Nurse Scan (5s) -> Nurse Confirm
      timer = setTimeout(() => {
        setNurseAuthMethod("scan");
        setConfirmedNurseId(generateNurseId());
        setStep("nurse-confirm");
      }, SCAN_DURATION_MS);
    } else if (step === "patient-scan") {
      // Step 5: Patient Scan (5s) -> Patient Confirm
      timer = setTimeout(() => setStep("patient-confirm"), SCAN_DURATION_MS);
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
        setResultNote("");
        
        // Optimistically save result
        createResult.mutate({
          nurseId: confirmedNurseId,
          patientId: MOCK_PATIENT,
          saa2Value: newResult.saa2,
          level: newResult.level,
          interpretation: newResult.interpretation
        });

        setResultPage(0);
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
            <QRScanner 
              label="Scanning Nurse QR / Barcode" 
              onScan={() => {
                setNurseAuthMethod("scan");
                setConfirmedNurseId(generateNurseId());
                setStep("nurse-confirm");
              }} 
              overlayImage={nurseQr}
            />
            
            <StatusCard 
              icon={User}
              title="Scan Nurse ID"
              description="Align barcode within the frame"
            />
            
            {/* Hidden debug button to skip wait */}
            <button onClick={() => {
              setNurseAuthMethod("scan");
              setConfirmedNurseId(generateNurseId());
              setStep("nurse-confirm");
            }} className="opacity-0 h-10">Skip</button>
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
            <QRScanner 
              label="Scanning Patient ID" 
              onScan={() => setStep("patient-confirm")} 
              overlayImage={patientQr}
            />
            
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
        
        // Calculate probability based on SAA2
        let severeProbability: "High" | "Medium" | "Low";
        
        if (result.saa2 > 200) {
          severeProbability = "High";
        } else if (result.saa2 > 100) {
          severeProbability = "Medium";
        } else {
          severeProbability = "Low";
        }
        
        const isHighRisk = severeProbability === "High";
        const isMedRisk = severeProbability === "Medium";

        // Likelihood of Invasive Bacterial Infection percentage derived from SAA2
        const ibiPercentage = Math.min(99, Math.round((result.saa2 / 500) * 100));

        // SAA2 threshold label for screen 3
        const saa2Threshold = result.saa2 > 200 ? "> 200 mg/L" : result.saa2 < 10 ? "< 10 mg/L" : "10 – 200 mg/L";
        
        const resultPageContent = (pageIndex: number) => (
          <div className="flex flex-col h-full pb-4 relative">
            <span className="absolute top-0 right-0 text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-bl-lg rounded-tr-lg z-10">
              Result Screen {pageIndex + 1}/3
            </span>
            <div className="flex-1 space-y-3 pt-2 overflow-y-auto">
              <div className="space-y-3">
                {/* Top card — differs per screen */}
                {pageIndex === 0 ? (
                  <div className={cn(
                    "p-4 rounded-xl border-2 text-center",
                    isHighRisk ? "bg-red-50 border-red-100" : isMedRisk ? "bg-amber-50 border-amber-100" : "bg-green-50 border-green-100"
                  )}>
                    <span className="text-xs font-bold uppercase opacity-60 block">Probability of Severe Infection</span>
                    <p className={cn(
                      "text-2xl font-bold mt-1",
                      isHighRisk ? "text-red-700" : isMedRisk ? "text-amber-700" : "text-green-700"
                    )} data-testid="text-severe-probability">{severeProbability}</p>
                  </div>
                ) : (
                  <div className={cn(
                    "p-4 rounded-xl border-2 text-center",
                    isHighRisk ? "bg-red-50 border-red-100" : isMedRisk ? "bg-amber-50 border-amber-100" : "bg-green-50 border-green-100"
                  )}>
                    <span className="text-xs font-bold uppercase opacity-60 block">Likelihood of Invasive Bacterial Infection</span>
                    <p className={cn(
                      "text-3xl font-bold mt-1",
                      isHighRisk ? "text-red-700" : isMedRisk ? "text-amber-700" : "text-green-700"
                    )} data-testid={`text-ibi-percentage-${pageIndex}`}>{ibiPercentage}<span className="text-lg font-normal">%</span></p>
                  </div>
                )}

                {/* Second card — SAA2 raw (screens 1 & 2) or threshold (screen 3) */}
                {pageIndex < 2 ? (
                  <div className={cn(
                    "p-4 rounded-xl border-2 text-center",
                    isHighRisk ? "bg-red-50 border-red-100" : isMedRisk ? "bg-amber-50 border-amber-100" : "bg-blue-50 border-blue-100"
                  )}>
                    <span className="text-xs font-bold uppercase opacity-60 block">SAA2 Level</span>
                    <p className={cn(
                      "text-2xl font-bold mt-1",
                      isHighRisk ? "text-red-700" : isMedRisk ? "text-amber-700" : "text-blue-700"
                    )} data-testid={`text-saa2-level-${pageIndex}`}>{result.saa2} <span className="text-sm font-normal">mg/L</span></p>
                  </div>
                ) : (
                  <div className={cn(
                    "p-4 rounded-xl border-2 text-center",
                    isHighRisk ? "bg-red-50 border-red-100" : isMedRisk ? "bg-amber-50 border-amber-100" : "bg-blue-50 border-blue-100"
                  )}>
                    <span className="text-xs font-bold uppercase opacity-60 block">SAA2 Threshold</span>
                    <p className={cn(
                      "text-2xl font-bold mt-1",
                      isHighRisk ? "text-red-700" : isMedRisk ? "text-amber-700" : "text-blue-700"
                    )} data-testid="text-saa2-threshold">{saa2Threshold}</p>
                  </div>
                )}

                {vitals.temperature && vitals.spO2 && vitals.respiratoryRate && (
                  <div className="bg-card border border-border rounded-xl p-3 shadow-sm" data-testid={`card-vitals-${pageIndex}`}>
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

                <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground pt-2 border-t border-border">
                  <div>
                    <span className="block font-bold">Patient</span>
                    <span className="font-mono">{MOCK_PATIENT}</span>
                  </div>
                  <div>
                    <span className="block font-bold">Nurse</span>
                    <span className="font-mono">{confirmedNurseId}</span>
                  </div>
                  {resultDateTime && (
                    <>
                      <div>
                        <span className="block font-bold">Date</span>
                        <span>{resultDateTime.toLocaleDateString()}</span>
                      </div>
                      <div className="text-right">
                        <span className="block font-bold">Time</span>
                        <span>{resultDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="pt-2 border-t border-border">
                  <ActionButton 
                    fullWidth 
                    onClick={() => setStep("cleo")}
                    data-testid="button-cleo"
                  >
                    <Bot className="w-5 h-5 mr-2" />
                    CLEO - Virtual Nurse
                  </ActionButton>
                </div>
              </div>
            </div>

            <div className="pt-3 space-y-2">
              <ActionButton fullWidth variant="outline" onClick={() => setStep("uploading")} data-testid="button-upload-ehr">
                Upload Data to EHR
              </ActionButton>
              <ActionButton fullWidth variant="outline" onClick={() => setStep("local-save-confirm")} data-testid="button-store-locally">
                Store Data Locally
              </ActionButton>
            </div>
          </div>
        );

        return (
          <div className="flex flex-col h-full max-w-sm mx-auto">
            <div
              className="flex-1 overflow-hidden relative"
              onTouchStart={(e) => { resultTouchStartX.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                if (resultTouchStartX.current === null) return;
                const delta = resultTouchStartX.current - e.changedTouches[0].clientX;
                if (delta > 50 && resultPage < 2) setResultPage(p => p + 1);
                if (delta < -50 && resultPage > 0) setResultPage(p => p - 1);
                resultTouchStartX.current = null;
              }}
            >
              <div
                className="flex h-full transition-transform duration-300 ease-in-out"
                style={{ width: "300%", transform: `translateX(-${resultPage * (100 / 3)}%)` }}
              >
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-full" style={{ width: "33.333%" }}>
                    {resultPageContent(i)}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-center gap-2 py-2">
              {[0, 1, 2].map((i) => (
                <button
                  key={i}
                  onClick={() => setResultPage(i)}
                  className={cn(
                    "w-2 h-2 rounded-full transition-colors",
                    resultPage === i ? "bg-primary" : "bg-muted-foreground/30"
                  )}
                  data-testid={`dot-result-page-${i}`}
                />
              ))}
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

      case "local-save-confirm":
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
              <h2 className="text-2xl font-display font-bold">Data Successfully Saved</h2>
              <p className="text-muted-foreground">Test data has been stored locally</p>
            </div>

            <div className="w-full pt-8">
              <ActionButton fullWidth onClick={restartWorkflow} data-testid="button-new-test">
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
