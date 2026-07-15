import {
  Battery,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
  Usb,
} from "lucide-react";

interface HeaderProps {
  onLogoClick?: () => void;
  connected?: boolean;
  /** Device battery level: DEAD | LOW | MID | HIGH_MID | HIGH | UNKNOWN */
  battery?: string;
}

function batteryDisplay(level?: string) {
  switch (level) {
    case "DEAD":
      return { Icon: BatteryWarning, className: "text-red-500", label: "Dead" };
    case "LOW":
      return { Icon: BatteryLow, className: "text-orange-500", label: "Low" };
    case "MID":
      return { Icon: BatteryMedium, className: "text-amber-500", label: "Mid" };
    case "HIGH_MID":
      return { Icon: BatteryMedium, className: "text-lime-500", label: "Good" };
    case "HIGH":
      return { Icon: BatteryFull, className: "text-green-500", label: "Full" };
    default:
      return { Icon: Battery, className: "text-muted-foreground", label: "—" };
  }
}

export function Header({ onLogoClick, connected = false, battery }: HeaderProps) {
  const { Icon, className, label } = batteryDisplay(battery);

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-background/80 backdrop-blur-md z-50 px-4 flex items-center justify-between border-b border-border/50">
      <button
        onClick={onLogoClick}
        className="flex items-center gap-2 hover:opacity-70 transition-opacity active:scale-95"
      >
        <span className="font-display font-bold text-primary tracking-tight">AbacusDetect</span>
      </button>
      <div className="flex items-center gap-3">
        <span
          className={`flex items-center gap-1 text-xs font-medium ${
            connected ? "text-green-600" : "text-muted-foreground"
          }`}
          data-testid="status-connection"
        >
          <Usb className="w-4 h-4" />
          {connected ? "Reader" : "Offline"}
        </span>
        <span className={`flex items-center gap-1 ${className}`} data-testid="status-battery">
          <Icon className="w-5 h-5" />
          <span className="text-xs font-mono font-medium">{label}</span>
        </span>
      </div>
    </header>
  );
}
