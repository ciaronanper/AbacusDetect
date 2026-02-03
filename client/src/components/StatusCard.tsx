import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface StatusCardProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  status?: "default" | "success" | "warning" | "error" | "processing";
}

export function StatusCard({ icon: Icon, title, description, status = "default" }: StatusCardProps) {
  const colors = {
    default: "bg-transparent text-foreground",
    success: "bg-transparent text-green-900",
    warning: "bg-transparent text-amber-900",
    error: "bg-transparent text-red-900",
    processing: "bg-transparent text-blue-900",
  };

  const iconColors = {
    default: "text-muted-foreground",
    success: "text-green-600",
    warning: "text-amber-600",
    error: "text-red-600",
    processing: "text-blue-600",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl p-6 ${colors[status]} flex flex-col items-center text-center gap-4`}
    >
      <div className={`p-4 rounded-full bg-white/80 shadow-sm ${iconColors[status]}`}>
        <Icon className="w-10 h-10" strokeWidth={1.5} />
      </div>
      <div>
        <h3 className="text-xl font-bold font-display">{title}</h3>
        {description && <p className="mt-2 text-sm opacity-80 font-medium">{description}</p>}
      </div>
    </motion.div>
  );
}
