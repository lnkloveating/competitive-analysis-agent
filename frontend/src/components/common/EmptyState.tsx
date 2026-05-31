import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-8 text-center shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description ? (
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
