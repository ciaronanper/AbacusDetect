import { Battery, Wifi } from "lucide-react";

export function Header({ onLogoClick }: { onLogoClick?: () => void }) {
  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-background/80 backdrop-blur-md z-50 px-4 flex items-center justify-between border-b border-border/50">
      <button 
        onClick={onLogoClick}
        className="flex items-center gap-2 hover:opacity-70 transition-opacity active:scale-95"
      >
        <span className="font-display font-bold text-primary tracking-tight">AbacusDetect</span>
      </button>
      <div className="flex items-center gap-3 text-muted-foreground">
        <Wifi className="w-5 h-5" />
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono font-medium">94%</span>
          <Battery className="w-5 h-5" />
        </div>
      </div>
    </header>
  );
}
