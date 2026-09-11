import { Usb } from "lucide-react";

interface HeaderProps {
  onLogoClick?: () => void;
  connected?: boolean;
}

export function Header({ onLogoClick, connected = false }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 h-[calc(3.5rem+var(--app-safe-top))] pt-[var(--app-safe-top)] bg-background/80 backdrop-blur-md z-50 px-4 flex items-center justify-between border-b border-border/50">
      <button
        onClick={onLogoClick}
        className="flex items-center gap-2 hover:opacity-70 transition-opacity active:scale-95"
      >
        <span className="font-display text-2xl text-primary tracking-tight">
          <span className="font-bold">Abacus</span>
          <span className="font-normal">Detect</span>
        </span>
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
      </div>
    </header>
  );
}
