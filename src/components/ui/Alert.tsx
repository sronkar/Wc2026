import type { ReactNode } from "react";

type Severity = "info" | "success" | "warning" | "error";

interface AlertProps {
  severity?: Severity;
  title?: string;
  children?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const STYLES: Record<Severity, { wrap: string; icon: string; iconColor: string; titleColor: string; bodyColor: string }> = {
  info: {
    wrap: "bg-blue-50 border-blue-200",
    icon: "ℹ️",
    iconColor: "text-blue-600",
    titleColor: "text-blue-900",
    bodyColor: "text-blue-800",
  },
  success: {
    wrap: "bg-green-50 border-green-200",
    icon: "✅",
    iconColor: "text-green-600",
    titleColor: "text-green-900",
    bodyColor: "text-green-800",
  },
  warning: {
    wrap: "bg-amber-50 border-amber-200",
    icon: "⚠️",
    iconColor: "text-amber-600",
    titleColor: "text-amber-900",
    bodyColor: "text-amber-800",
  },
  error: {
    wrap: "bg-red-50 border-red-200",
    icon: "❌",
    iconColor: "text-red-600",
    titleColor: "text-red-900",
    bodyColor: "text-red-800",
  },
};

/**
 * Standardized banner for error, warning, success, and info messages.
 * Use instead of ad-hoc "text-red-600" spans — gives consistent padding,
 * icon, and optional dismiss button across the app.
 */
export function Alert({ severity = "info", title, children, onDismiss, className = "" }: AlertProps) {
  const s = STYLES[severity];
  return (
    <div
      role={severity === "error" || severity === "warning" ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2.5 flex items-start gap-2.5 ${s.wrap} ${className}`}
    >
      <span className={`shrink-0 leading-5 ${s.iconColor}`} aria-hidden="true">{s.icon}</span>
      <div className="flex-1 min-w-0 text-sm">
        {title && <p className={`font-semibold ${s.titleColor}`}>{title}</p>}
        {children && <div className={title ? `mt-0.5 ${s.bodyColor}` : s.bodyColor}>{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className={`shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-black/5 ${s.iconColor}`}
        >
          ×
        </button>
      )}
    </div>
  );
}
