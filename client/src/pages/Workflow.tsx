import React, { useState, useEffect } from "react";
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
  Loader2
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ActionButton } from "@/components/ActionButton";
import { StatusCard } from "@/components/StatusCard";
import { Header } from "@/components/Header";
import { FaceDetection } from "@/components/FaceDetection";
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
  | "results";

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
const MOCK_NURSE = "Jane Doe";
const MOCK_PATIENT = "XU274";
const TEST_DURATION_SECONDS = 300; // 5 minutes
const SCAN_DURATION_MS = 5000;

export default function Workflow() {
  const [step, setStep] = useState<Step>("home");
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState<TestResult | null>(null);
  const [nurseId, setNurseId] = useState("");
  const [resultNote, setResultNote] = useState("");
  const [resultDateTime, setResultDateTime] = useState<Date | null>(null);
  const [vitals, setVitals] = useState<Vitals>({ temperature: "", spO2: "", respiratoryRate: "" });
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
      timer = setTimeout(() => setStep("nurse-confirm"), SCAN_DURATION_MS);
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


  // === HELPERS ===
  const generateRandomVitals = (): Vitals => {
    const temp = (96 + Math.random() * 6).toFixed(1); // 96.0 - 102.0 F
    const spO2 = Math.floor(88 + Math.random() * 12).toString(); // 88-99%
    const respRate = Math.floor(12 + Math.random() * 12).toString(); // 12-23 breaths/min
    return { temperature: temp, spO2, respiratoryRate: respRate };
  };

  // === HANDLERS ===
  const startWorkflow = () => setStep("connecting");
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
                Scan Nurse QR / Barcode
              </ActionButton>
              <ActionButton variant="outline" fullWidth onClick={() => setStep("nurse-face-id")}>
                <User className="w-5 h-5 mr-2" />
                Face ID
              </ActionButton>
              <ActionButton variant="outline" fullWidth onClick={() => setStep("nurse-id-input")}>
                Input Nurse ID number
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
            <QRScanner 
              label="Scanning Nurse QR / Barcode" 
              onScan={() => setStep("nurse-confirm")} 
              overlayImage={nurseQr}
            />
            
            <StatusCard 
              icon={User}
              title="Scan Nurse ID"
              description="Align barcode within the frame"
            />
            
            {/* Hidden debug button to skip wait */}
            <button onClick={() => setStep("nurse-confirm")} className="opacity-0 h-10">Skip</button>
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
                  <div key={i} className={`w-10 h-14 bg-card border-2 rounded-xl flex items-center justify-center ${i === nurseId.length ? "border-primary" : "border-border"}`}>
                    <span className="text-2xl font-mono font-bold text-primary">
                      {nurseId[i] ? "•" : ""}
                    </span>
                  </div>
                ))}
              </div>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={nurseId}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setNurseId(value);
                }}
                autoFocus
                className="sr-only"
                data-testid="input-nurse-id"
              />
            </label>

            <div className="w-full space-y-4 pt-8">
              <ActionButton 
                fullWidth 
                onClick={() => setStep("nurse-confirm")}
                disabled={nurseId.length !== 6}
              >
                Confirm Identity
              </ActionButton>
              <ActionButton variant="outline" fullWidth onClick={() => { setNurseId(""); setStep("nurse-auth-choice"); }}>
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

            <div className="w-full space-y-4 pt-4">
              <p className="text-center font-medium">Correct ID?</p>
              <div className="grid grid-cols-2 gap-4">
                <ActionButton variant="outline" onClick={() => setStep("patient-scan")}>No</ActionButton>
                <ActionButton variant="primary" onClick={() => setStep("vitals-choice")}>Yes</ActionButton>
              </div>
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
        
        // Calculate probability and ESI based on SAA2
        let severeProbability: "High" | "Medium" | "Low";
        let recommendedESI: 2 | 3 | 4;
        
        if (result.saa2 > 200) {
          severeProbability = "High";
          recommendedESI = 2;
        } else if (result.saa2 > 100) {
          severeProbability = "Medium";
          recommendedESI = 3;
        } else {
          severeProbability = "Low";
          recommendedESI = 4;
        }
        
        const isHighRisk = severeProbability === "High";
        const isMedRisk = severeProbability === "Medium";
        
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
                  "p-4 rounded-2xl border-2 text-center",
                  isHighRisk ? "bg-red-50 border-red-100" : isMedRisk ? "bg-amber-50 border-amber-100" : "bg-green-50 border-green-100"
                )}>
                  <span className="text-xs font-bold uppercase opacity-60 mb-1 block">Probability of Severe Infection</span>
                  <p className={cn(
                    "text-2xl font-bold",
                    isHighRisk ? "text-red-700" : isMedRisk ? "text-amber-700" : "text-green-700"
                  )} data-testid="text-severe-probability">{severeProbability}</p>
                </div>

                <div className={cn(
                  "p-4 rounded-2xl border-2 text-center",
                  isHighRisk ? "bg-red-50 border-red-100" : isMedRisk ? "bg-amber-50 border-amber-100" : "bg-blue-50 border-blue-100"
                )}>
                  <span className="text-xs font-bold uppercase opacity-60 mb-1 block">Recommended ESI</span>
                  <p className={cn(
                    "text-3xl font-bold",
                    isHighRisk ? "text-red-700" : isMedRisk ? "text-amber-700" : "text-blue-700"
                  )} data-testid="text-recommended-esi">{recommendedESI}</p>
                </div>

                {vitals.temperature && vitals.spO2 && vitals.respiratoryRate && (
                  <div className="bg-card border border-border rounded-2xl p-4 shadow-sm" data-testid="card-vitals">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-3">Patient Vitals</span>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="space-y-1">
                        <div className="flex items-center justify-center gap-1 text-muted-foreground">
                          <Thermometer className="w-3 h-3" />
                          <span className="text-xs">Temp</span>
                        </div>
                        <p className="text-lg font-mono font-bold" data-testid="text-temperature">{vitals.temperature}°F</p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-center gap-1 text-muted-foreground">
                          <Heart className="w-3 h-3" />
                          <span className="text-xs">SpO₂</span>
                        </div>
                        <p className="text-lg font-mono font-bold" data-testid="text-spo2">{vitals.spO2}%</p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-center gap-1 text-muted-foreground">
                          <Wind className="w-3 h-3" />
                          <span className="text-xs">Resp</span>
                        </div>
                        <p className="text-lg font-mono font-bold" data-testid="text-respiratory-rate">{vitals.respiratoryRate}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground pt-4 border-t border-border">
                  <div>
                    <span className="block font-bold">Patient</span>
                    <span className="font-mono">{MOCK_PATIENT}</span>
                  </div>
                  <div>
                    <span className="block font-bold">Nurse</span>
                    <span>{MOCK_NURSE}</span>
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

                <div className="pt-4 border-t border-border">
                  <label className="block text-xs font-bold text-muted-foreground mb-2">Add Note</label>
                  <Textarea
                    placeholder="Enter any additional notes here..."
                    value={resultNote}
                    onChange={(e) => setResultNote(e.target.value)}
                    className="min-h-[80px] text-sm"
                    data-testid="textarea-result-note"
                  />
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
