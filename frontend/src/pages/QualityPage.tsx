import { EmptyState } from "../components/common/EmptyState";

type QualityPageProps = {
  taskId?: string;
  onNavigate: (key: string) => void;
};

export function QualityPage({ taskId, onNavigate }: QualityPageProps) {
  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-6">
        <p className="text-sm font-medium text-cyan-300">Quality Check</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">
          Quality Check
        </h2>
      </div>
      <EmptyState
        title={taskId ? "Quality workspace initialized" : "No active task"}
        description={
          taskId
            ? `Task ID: ${taskId}`
            : "Start a gaming_mouse analysis task to attach quality data."
        }
        action={
          !taskId ? (
            <button
              className="rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950"
              onClick={() => onNavigate("new-analysis")}
              type="button"
            >
              New Analysis
            </button>
          ) : undefined
        }
      />
    </section>
  );
}
