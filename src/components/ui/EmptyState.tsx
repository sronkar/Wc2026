import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * Centered empty-state block: icon + title + optional description + optional
 * call-to-action. Replaces scattered "No X yet." lines with something that
 * invites the next step.
 */
export function EmptyState({ icon = "⚽", title, description, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`text-center py-10 px-4 ${className}`}>
      <div className="text-4xl mb-2" aria-hidden="true">{icon}</div>
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      {description && <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
