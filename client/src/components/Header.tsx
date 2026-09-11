import { Usb } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface HeaderProps {
  onLogoClick?: () => void;
  connected?: boolean;
  home?: boolean;
}

export function Header({ onLogoClick, connected = false, home = false }: HeaderProps) {
  return (
    <header className="absolute top-0 left-0 right-0 h-[calc(3.5rem+var(--app-safe-top))] pt-[var(--app-safe-top)] bg-background/80 backdrop-blur-md z-50 px-4 flex items-center justify-between border-b border-border/50">
      <AnimatePresence initial={false} mode="wait">
        {home ? (
          <motion.button
            key="home-wordmark"
            type="button"
            onClick={onLogoClick}
            aria-label="Return to home"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="absolute left-4 border-0 bg-transparent p-0 font-display text-base text-primary tracking-tight cursor-pointer"
          >
            <span className="font-bold">Abacus</span>
            <span className="font-normal">Detect</span>
          </motion.button>
        ) : (
          <motion.button
            key="app-wordmark"
            type="button"
            onClick={onLogoClick}
            aria-label="Return to home"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="absolute inset-x-0 mx-auto w-max border-0 bg-transparent p-0 font-display text-2xl text-primary tracking-tight cursor-pointer"
          >
            <span className="font-bold">Abacus</span>
            <span className="font-normal">Detect</span>
          </motion.button>
        )}
      </AnimatePresence>
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
