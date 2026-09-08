import type { ReactNode } from "react";

export type BadgeTone = "success" | "warning" | "danger" | "neutral" | "active";

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: "bg-success/15 text-success border-success",
  warning: "bg-warning/15 text-warning border-warning",
  danger: "bg-danger/15 text-danger border-danger",
  neutral: "bg-ink-faint/10 text-ink-muted border-ink-faint",
  active: "bg-accent/15 text-accent border-accent",
};

export function Badge({ tone = "neutral", icon, children }: { tone?: BadgeTone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${TONE_CLASSES[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}
