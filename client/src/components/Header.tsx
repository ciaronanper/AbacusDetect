import { Usb } from "lucide-react";

interface HeaderProps {
  onLogoClick?: () => void;
  connected?: boolean;
  home?: boolean;
}

export function Header({ onLogoClick, connected = false, home = false }: HeaderProps) {
  return (
    <header className="relative fixed top-0 left-0 right-0 h-[calc(3.5rem+var(--app-safe-top))] pt-[var(--app-safe-top)] bg-background/80 backdrop-blur-md z-50 px-4 flex items-center justify-between border-b border-border/50">
      <span
        className={`absolute font-display text-primary tracking-tight pointer-events-none ${
          home ? "left-4 text-base" : "left-1/2 -translate-x-1/2 text-2xl"
        }`}
      >
        <span className="font-bold">Abacus</span>
        <span className="font-normal">Detect</span>
      </span>
      <div className="ml-auto flex items-center gap-3">
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
