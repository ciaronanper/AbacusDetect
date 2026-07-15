import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Power,
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
  Moon,
} from "lucide-react";
import { ActionButton } from "@/components/ActionButton";
import { StatusCard } from "@/components/StatusCard";
import { Header } from "@/components/Header";
import { QrScanner } from "@/components/QrScanner";
import { useReader } from "@/hooks/useReader";
import { useCreateResult } from "@/hooks/use-results";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  parseResult,
  classifyValue,
  viewToDisplayText,
  errorToDisplayText,
} from "@/lib/readerProtocol";
import logoPng from "@assets/Vertical_logo_bgtransparent_1769613129480.png";

// App-controlled phases. Nurse + patient identification happen on the phone;
// after that the physical reader becomes the host and drives every screen.
type Phase = "connect" | "nurse-scan" | "patient-scan" | "running";

const TEST_DURATION_SECONDS = 300; // 5-minute assay countdown (visual)

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
  const [powerPressed, setPowerPressed] = useState(false);
  const [devOpen, setDevOpen] = useState(false);

  const { toast } = useToast();
  const createResult = useCreateResult();
  const reader = useReader();
  const { readerState } = reader;
  const view = readerState.currentView;

  const savedRef = useRef(false);
  const prevViewRef = useRef("");
  const autoConnectedRef = useRef(false);
  const simPlayedRef = useRef(false);

  // --- Start the assay countdown when the device reports SAMPLE_DETECTED ---
  useEffect(() => {
    if (phase === "running" && view === "SAMPLE_DETECTED" && prevViewRef.current !== "SAMPLE_DETECTED") {
      setTimeLeft(TEST_DURATION_SECONDS);
    }
    prevViewRef.current = view;
  }, [view, phase]);

  useEffect(() => {
    if (!(phase === "running" && view === "SAMPLE_DETECTED")) return;
    const id = setInterval(() => setTimeLeft((t) => (t > 0 ? t - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [phase, view]);

  // --- Persist the result once the device displays it ----------------------
  useEffect(() => {
    if (phase !== "running") return;
    // Only DISPLAYRESULT carries a valid result payload — every other screen
    // clears resultText in applyMessage, so this is the single save trigger.
    if (view !== "DISPLAYRESULT" || !readerState.resultText || savedRef.current) return;

    const { value, units } = parseResult(readerState.resultText);
    if (value == null) return;

    const { level, interpretation } = classifyValue(value);
    savedRef.current = true;
    setResultAt(new Date());
    createResult.mutate(
      {
        nurseId: nurseId || "UNKNOWN",
        patientId: patientId || "UNKNOWN",
        value,
        units: units || "mg/L",
        level,
        interpretation,
      },
      {
        onError: () => {
          savedRef.current = false;
          toast({
            title: "Save failed",
            description: "Could not save the result to the health record.",
            variant: "destructive",
          });
        },
      },
    );
  }, [readerState, phase, nurseId, patientId, createResult, view, toast]);

  // Native auto-connect: mirror the Flutter app, which opens the USB connection
  // as soon as the reader screen appears. Runs once on the packaged Android
  // build; on the web the user taps "Connect Reader (USB)" instead.
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
      { at: 7500, line: "RESULT:162:mg/L" },
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
          ? "No reader detected over USB. Connect the MicroNow reader to this computer, or use the Android app with the reader plugged into the phone. Or tap \u201CUse Simulator\u201D to preview the flow."
          : "USB serial needs desktop Chrome/Edge or the packaged Android app. Tap \u201CUse Simulator\u201D to preview the flow.",
        variant: "destructive",
      });
    }
  };

  const connectSimulator = async () => {
    await reader.connectSimulator();
    setPhase("nurse-scan");
  };

  const newTest = () => {
    savedRef.current = false;
    simPlayedRef.current = false;
    setNurseId("");
    setPatientId("");
    setTimeLeft(0);
    setResultAt(null);
    reader.resetReaderState();
    setPhase(reader.connected ? "nurse-scan" : "connect");
  };

  const goHome = async () => {
    await reader.disconnect();
    savedRef.current = false;
    simPlayedRef.current = false;
    setNurseId("");
    setPatientId("");
    setTimeLeft(0);
    setResultAt(null);
    reader.resetReaderState();
    setPhase("connect");
  };

  // Power button: press/release mirror the firmware handshake (BUTTON / BUTTON_UP).
  const powerDown = () => {
    setPowerPressed(true);
    reader.sendButtonDown();
  };
  const powerUp = () => {
    setPowerPressed(false);
    reader.sendButtonUp();
  };

  const PowerButton = () => (
    <div className="flex flex-col items-center gap-2 pt-2">
      <button
        onPointerDown={powerDown}
        onPointerUp={powerUp}
        onPointerLeave={() => powerPressed && powerUp()}
        onPointerCancel={powerUp}
        aria-label="Power"
        data-testid="button-power"
        className={cn(
          "w-20 h-20 rounded-full flex flex-col items-center justify-center text-white shadow-lg transition-transform select-none touch-none",
          powerPressed ? "bg-red-700 scale-95" : "bg-red-600 hover:bg-red-500",
        )}
      >
        <Power className="w-8 h-8" />
        <span className="text-[9px] font-bold tracking-widest mt-0.5">POWER</span>
      </button>
    </div>
  );

  // --- Device-driven screens ----------------------------------------------
  const renderDeviceView = () => {
    switch (view) {
      case "INSERT_CARTRIDGE":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <img src={logoPng} alt="Abacus Labs" className="h-28 w-auto mx-auto object-contain" />
            <StatusCard
              icon={TestTube2}
              title="Insert Cartridge"
              description="Insert the SAA2 cartridge into the reader port"
            />
            <PowerButton />
          </div>
        );

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
            <PowerButton />
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
            <PowerButton />
          </div>
        );

      case "CHECKING":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <div className="w-28 h-28 bg-primary/10 rounded-full flex items-center justify-center">
              <Loader2 className="w-14 h-14 text-primary animate-spin" />
            </div>
            <StatusCard icon={Loader2} title="Checking…" description="The reader is working. Please wait." status="processing" />
            <PowerButton />
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
            <PowerButton />
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
            <PowerButton />
          </div>
        );

      case "BARCODE_INVALID":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <StatusCard icon={AlertTriangle} title="Barcode Invalid" description="The cartridge barcode could not be read." status="error" />
            <PowerButton />
          </div>
        );

      case "NOCLINE":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <StatusCard icon={AlertTriangle} title="No Control Line" description="No control line detected. Please retest." status="error" />
            <PowerButton />
          </div>
        );

      case "CLEAN_LENS":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <StatusCard icon={Eye} title="Clean Lens" description="Please clean the reader lens and try again." status="warning" />
            <PowerButton />
          </div>
        );

      case "POWEROFF":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <StatusCard icon={Power} title="Power Off" description="The reader is powering off." />
          </div>
        );

      case "WAKEUP":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <StatusCard icon={Moon} title="Wake Device" description="Waking the reader…" status="processing" />
            <PowerButton />
          </div>
        );

      case "WAITING":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <div className="w-28 h-28 bg-secondary/60 rounded-full flex items-center justify-center">
              <Usb className="w-14 h-14 text-muted-foreground" />
            </div>
            <StatusCard
              icon={Usb}
              title={reader.kind === "simulator" ? "Simulating Reader\u2026" : "Waiting for Reader"}
              description={
                reader.kind === "simulator"
                  ? "Running a demo of the reader flow \u2014 the screens advance automatically."
                  : "Follow the prompts on the reader. This screen will update automatically."
              }
              status="processing"
            />
            <PatientChips />
            <PowerButton />
          </div>
        );

      default:
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <StatusCard icon={Usb} title={viewToDisplayText(view)} description="Follow the prompts on the reader." />
            <PowerButton />
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
    const parsed = parseResult(readerState.resultText);
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
          <PowerButton />
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

    const gaugePinPct = (() => {
      const s = value;
      if (s < 10) return (s / 10) * 20;
      if (s < 50) return 20 + ((s - 10) / 40) * 20;
      if (s <= 200) return 40 + ((s - 50) / 150) * 20;
      if (s <= 300) return 60 + ((s - 200) / 100) * 20;
      return 80 + Math.min((s - 300) / 300, 1) * 20;
    })();
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
            <span className="text-xs font-bold uppercase opacity-60 block mb-2">Probability of SBI</span>
            <span className={cn("inline-block text-xl font-bold px-5 py-1.5 rounded-full text-white", band.badgeColor)} data-testid="text-sbi-probability">
              {band.label}
            </span>
          </div>

          <div className={cn("p-4 rounded-xl border-2 text-center", band.bg, band.border)} data-testid="card-saa2-level">
            <span className="text-xs font-bold uppercase opacity-60 block">SAA2 Level</span>
            <p className={cn("text-3xl font-bold mt-1 tabular-nums", band.textColor)} data-testid="text-saa2-value">
              {value} <span className="text-base font-normal">{units}</span>
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 shadow-sm" data-testid="card-severity-gauge">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">SAA2 Range</span>
              <span className={cn("text-xs font-bold px-2 py-0.5 rounded text-white", band.badgeColor)}>{band.zone}</span>
            </div>
            <div className="relative px-1">
              <div className="absolute bottom-[calc(100%-2px)] flex flex-col items-center" style={{ left: pinLeft }}>
                <div className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[14px] border-t-gray-600" />
              </div>
              <div className="mt-9 rounded-lg border border-gray-200 overflow-hidden">
                <div className="flex h-5">
                  <div className="bg-green-800" style={{ width: "20%" }} />
                  <div className="bg-green-400" style={{ width: "20%" }} />
                  <div className="bg-yellow-400" style={{ width: "20%" }} />
                  <div className="bg-orange-400" style={{ width: "20%" }} />
                  <div className="bg-red-500" style={{ width: "20%" }} />
                </div>
              </div>
            </div>
            <div className="relative h-5 mt-1">
              {[
                { label: "0", pct: 0 },
                { label: "10", pct: 20 },
                { label: "50", pct: 40 },
                { label: "200", pct: 60 },
                { label: "300+", pct: 80 },
              ].map(({ label, pct }) => (
                <span key={label} className="absolute text-xs text-muted-foreground" style={{ left: `${pct}%`, transform: pct === 0 ? "none" : "translateX(-50%)" }}>
                  {label}
                </span>
              ))}
            </div>
          </div>

          {savedRef.current && (
            <div className="flex items-center justify-center gap-2 text-sm text-green-600 font-medium" data-testid="text-saved">
              <CheckCircle2 className="w-4 h-4" />
              Saved to health record
            </div>
          )}

          <ActionButton fullWidth onClick={newTest} data-testid="button-new-test">
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
            <div className="text-center space-y-1">
              <h2 className="text-xl font-display font-bold">Connect Reader</h2>
              <p className="text-sm text-muted-foreground">Plug in the MicroNow reader over USB to begin.</p>
            </div>
            <div className="w-full space-y-3">
              <ActionButton fullWidth onClick={connectUsb} disabled={reader.connecting} data-testid="button-connect-usb">
                <Usb className="w-5 h-5 mr-2" />
                {reader.connecting ? "Connecting…" : "Connect Reader (USB)"}
              </ActionButton>
              <ActionButton variant="outline" fullWidth onClick={connectSimulator} disabled={reader.connecting} data-testid="button-connect-simulator">
                <Bug className="w-5 h-5 mr-2" />
                Use Simulator (Preview)
              </ActionButton>
            </div>
            {!reader.isNativePlatform && !reader.webSerialSupported && (
              <p className="text-xs text-center text-muted-foreground">
                USB serial needs desktop Chrome/Edge or the packaged Android build. Use the simulator to preview the flow here.
              </p>
            )}
          </div>
        );

      case "nurse-scan":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <StatusCard icon={UserCheck} title="Scan Nurse QR" description="Point the rear camera at the nurse ID QR code" />
            <QrScanner
              label="Scanning Nurse QR"
              onScan={(text) => {
                setNurseId(text);
                setPhase("patient-scan");
              }}
            />
          </div>
        );

      case "patient-scan":
        return (
          <div className="flex flex-col items-center justify-center h-full gap-6 max-w-sm mx-auto">
            <StatusCard icon={User} title="Scan Patient QR" description="Point the rear camera at the patient wristband QR code" />
            <QrScanner
              label="Scanning Patient QR"
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
      <Header onLogoClick={goHome} connected={reader.connected} battery={readerState.battery} />

      <main className="flex-1 px-6 pt-20 pb-8 safe-area-pb overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${phase}-${phase === "running" ? view : ""}`}
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
      "RESULT:162:mg/L",
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
