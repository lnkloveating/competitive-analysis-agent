type StatusBadgeProps = {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
};

const toneClasses: Record<NonNullable<StatusBadgeProps["tone"]>, string> = {
  neutral: "border-slate-600/45 bg-slate-800/55 text-slate-200",
  success: "border-emerald-500/35 bg-emerald-500/10 text-emerald-200",
  warning: "border-amber-500/35 bg-amber-500/10 text-amber-200",
  danger: "border-rose-500/35 bg-rose-500/10 text-rose-200",
  info: "border-cyan-500/35 bg-cyan-500/10 text-cyan-200",
};

export function StatusBadge({ label, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium shadow-[0_0_18px_rgba(15,23,42,0.18)] ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}
