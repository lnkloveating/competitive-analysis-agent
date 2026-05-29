type LoadingStateProps = {
  label?: string;
};

export function LoadingState({ label = "Loading data..." }: LoadingStateProps) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/45 p-6 text-sm text-slate-300">
      <span className="mr-3 h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.8)]" />
      {label}
    </div>
  );
}
