import { useEffect, useMemo, useState } from "react";
import { analysisApi } from "../api/analysisApi";
import { EmptyState } from "../components/common/EmptyState";
import { LoadingState } from "../components/common/LoadingState";
import { MetricCard } from "../components/common/MetricCard";
import { StatusBadge } from "../components/common/StatusBadge";
import type { AgentTrace, QualityResult } from "../types/analysis";

type QualityPageProps = {
  taskId?: string;
  onNavigate: (key: string) => void;
};

type QualityPayload = {
  task_id?: string;
  quality_result?: QualityResult;
  is_approved?: boolean;
  iteration_count?: number;
  rejected_agents?: string[];
  needs_human_review?: boolean;
  quality_status?: string;
};

const checkTone = {
  passed: "success",
  failed: "danger",
} as const;

function normalizeTrace(traceLog: unknown): AgentTrace[] {
  if (!Array.isArray(traceLog)) {
    return [];
  }

  return traceLog
    .filter((item): item is Record<string, unknown> => {
      return Boolean(item) && typeof item === "object";
    })
    .map((item) => ({
      step_id: typeof item.step_id === "number" ? item.step_id : undefined,
      agent_name:
        typeof item.agent_name === "string" ? item.agent_name : "UnknownAgent",
      status: typeof item.status === "string" ? item.status : "pending",
      input_summary:
        typeof item.input_summary === "string" ? item.input_summary : undefined,
      output_summary:
        typeof item.output_summary === "string"
          ? item.output_summary
          : undefined,
      duration_ms:
        typeof item.duration_ms === "number" ? item.duration_ms : undefined,
      error:
        typeof item.error === "string" || item.error === null
          ? item.error
          : undefined,
    }));
}

function asList(value: string[] | undefined, fallback?: string): string[] {
  if (Array.isArray(value) && value.length > 0) {
    return value;
  }

  return fallback ? [fallback] : [];
}

function getQualityScore(quality?: QualityResult): number | undefined {
  const score = quality?.score ?? quality?.quality_score;
  return typeof score === "number" ? score : undefined;
}

function getQualityApproved(payload: QualityPayload | null): boolean | undefined {
  if (typeof payload?.quality_result?.approved === "boolean") {
    return payload.quality_result.approved;
  }

  if (typeof payload?.is_approved === "boolean") {
    return payload.is_approved;
  }

  return undefined;
}

function formatValue(value?: number) {
  return typeof value === "number" ? value.toFixed(1) : "N/A";
}

function StatusList({
  emptyLabel,
  items,
  tone = "neutral",
}: {
  emptyLabel: string;
  items: string[];
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  if (items.length === 0) {
    return <span className="text-sm text-slate-500">{emptyLabel}</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <StatusBadge key={item} label={item} tone={tone} />
      ))}
    </div>
  );
}

export function QualityPage({ taskId, onNavigate }: QualityPageProps) {
  const [qualityPayload, setQualityPayload] = useState<QualityPayload | null>(
    null,
  );
  const [traceLog, setTraceLog] = useState<AgentTrace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      setQualityPayload(null);
      setTraceLog([]);
      setError(null);
      return;
    }

    const activeTaskId = taskId;
    let cancelled = false;

    async function loadQuality() {
      setIsLoading(true);
      setError(null);

      try {
        const [qualityResult, traceResult] = await Promise.allSettled([
          analysisApi.getQuality(activeTaskId),
          analysisApi.getTrace(activeTaskId),
        ]);

        if (cancelled) {
          return;
        }

        if (qualityResult.status === "fulfilled") {
          setQualityPayload(qualityResult.value);
        } else {
          setQualityPayload(null);
        }

        if (traceResult.status === "fulfilled") {
          setTraceLog(normalizeTrace(traceResult.value?.trace_log));
        } else {
          setTraceLog([]);
        }

        const failedEndpoints = [
          qualityResult.status === "rejected" ? "quality" : null,
          traceResult.status === "rejected" ? "trace" : null,
        ].filter((endpoint): endpoint is string => Boolean(endpoint));

        setError(
          failedEndpoints.length > 0
            ? `Unable to load ${failedEndpoints.join(", ")} endpoint.`
            : null,
        );
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load quality result.",
          );
          setQualityPayload(null);
          setTraceLog([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadQuality();

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const quality = qualityPayload?.quality_result;
  const qualityScore = getQualityScore(quality);
  const approved = getQualityApproved(qualityPayload);
  const checkedItems = quality?.checked_items ?? {};
  const checkedEntries = Object.entries(checkedItems);
  const passedChecks = asList(quality?.passed_checks);
  const failedChecks = asList(quality?.failed_checks);
  const missingDimensions = asList(quality?.missing_dimensions);
  const missingPlatforms = asList(quality?.missing_platforms);
  const requiredActions = asList(
    quality?.required_actions,
    quality?.required_fix,
  );
  const rejectedAgents = qualityPayload?.rejected_agents ?? [];
  const rejectTo = quality?.reject_to ?? quality?.target_agent ?? null;
  const rejectReason =
    quality?.reject_reason ?? quality?.reason ?? quality?.status ?? null;
  const qualityTrace = useMemo(
    () =>
      traceLog
        .filter((trace) => trace.agent_name === "QualityAgent")
        .slice()
        .reverse()[0],
    [traceLog],
  );
  const hasQualityData = Boolean(
    quality && Object.keys(quality).length > 0,
  );
  const statusLabel =
    qualityPayload?.quality_status || quality?.status || "not ready";

  if (!taskId) {
    return (
      <section className="mx-auto max-w-6xl">
        <EmptyState
          title="No active task"
          description="Start a gaming_mouse analysis task before opening the quality check."
          action={
            <button
              className="rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
              onClick={() => onNavigate("new-analysis")}
              type="button"
            >
              New Analysis
            </button>
          }
        />
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan-300">Quality Check</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">
            Quality Gate Review
          </h2>
          <p className="mt-3 max-w-3xl break-all text-sm leading-6 text-slate-400">
            Task ID: {taskId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <StatusBadge
            label={approved === true ? "approved" : approved === false ? "not approved" : "pending"}
            tone={approved === true ? "success" : approved === false ? "warning" : "neutral"}
          />
          <StatusBadge
            label={
              qualityPayload?.needs_human_review
                ? "human review"
                : statusLabel
            }
            tone={qualityPayload?.needs_human_review ? "warning" : "info"}
          />
        </div>
      </div>

      {isLoading ? <LoadingState label="Loading quality gate result..." /> : null}

      {error ? (
        <div className="mb-5 rounded-md border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {!isLoading && !error ? (
        !hasQualityData ? (
          <EmptyState
            title="No quality result returned yet"
            description="Wait for QualityAgent to run, then reopen this page."
          />
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-4">
              <MetricCard
                label="quality_score"
                value={formatValue(qualityScore)}
                helper="QualityAgent score"
              />
              <MetricCard
                label="iteration_count"
                value={qualityPayload?.iteration_count ?? "N/A"}
                helper="repair attempts"
              />
              <MetricCard
                label="checked_items"
                value={checkedEntries.length}
                helper="automated checks"
              />
              <MetricCard
                label="rejected_agents"
                value={rejectedAgents.length}
                helper="sent back by quality gate"
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      Automated Check Items
                    </h3>
                    <p className="mt-1 text-sm text-slate-400">
                      Each row reflects the backend quality_result.checked_items map.
                    </p>
                  </div>
                  <StatusBadge
                    label={approved ? "pass" : "needs attention"}
                    tone={approved ? "success" : "warning"}
                  />
                </div>

                {checkedEntries.length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {checkedEntries.map(([name, passed]) => (
                      <div
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/45 px-4 py-3"
                        key={name}
                      >
                        <span className="text-sm text-slate-200">{name}</span>
                        <StatusBadge
                          label={passed ? "passed" : "failed"}
                          tone={passed ? checkTone.passed : checkTone.failed}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No checked_items returned"
                    description="The backend returned a quality result, but no check item map."
                  />
                )}

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <section className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-4">
                    <h4 className="text-sm font-semibold text-emerald-100">
                      Passed Checks
                    </h4>
                    <div className="mt-3">
                      <StatusList
                        emptyLabel="No passed checks reported"
                        items={passedChecks}
                        tone="success"
                      />
                    </div>
                  </section>

                  <section className="rounded-lg border border-rose-400/25 bg-rose-500/10 p-4">
                    <h4 className="text-sm font-semibold text-rose-100">
                      Failed Checks
                    </h4>
                    <div className="mt-3">
                      <StatusList
                        emptyLabel="No failed checks reported"
                        items={failedChecks}
                        tone="danger"
                      />
                    </div>
                  </section>
                </div>
              </div>

              <aside className="space-y-5">
                <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-5">
                  <h3 className="text-lg font-semibold text-white">
                    Rejection Route
                  </h3>
                  <dl className="mt-4 space-y-4 text-sm">
                    <div>
                      <dt className="text-slate-500">reject_to</dt>
                      <dd className="mt-1 text-slate-100">
                        {rejectTo || "None"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">reject_reason</dt>
                      <dd className="mt-1 leading-6 text-slate-200">
                        {rejectReason || "None"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">rejected_agents</dt>
                      <dd className="mt-2">
                        <StatusList
                          emptyLabel="No rejected agents"
                          items={rejectedAgents}
                          tone="warning"
                        />
                      </dd>
                    </div>
                  </dl>
                </section>

                <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-5">
                  <h3 className="text-lg font-semibold text-white">
                    Coverage Gaps
                  </h3>
                  <div className="mt-4">
                    <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                      missing_dimensions
                    </p>
                    <StatusList
                      emptyLabel="None"
                      items={missingDimensions}
                      tone="warning"
                    />
                  </div>
                  <div className="mt-5">
                    <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                      missing_platforms
                    </p>
                    <StatusList
                      emptyLabel="None"
                      items={missingPlatforms}
                      tone="warning"
                    />
                  </div>
                </section>

                <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-5">
                  <h3 className="text-lg font-semibold text-white">
                    Quality Trace
                  </h3>
                  <dl className="mt-4 space-y-4 text-sm">
                    <div>
                      <dt className="text-slate-500">status</dt>
                      <dd className="mt-1 text-slate-100">
                        {qualityTrace?.status || "Not reported"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">output_summary</dt>
                      <dd className="mt-1 leading-6 text-slate-200">
                        {qualityTrace?.output_summary ||
                          "No QualityAgent trace summary yet."}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">duration_ms</dt>
                      <dd className="mt-1 text-slate-100">
                        {typeof qualityTrace?.duration_ms === "number"
                          ? qualityTrace.duration_ms
                          : "Not reported"}
                      </dd>
                    </div>
                  </dl>
                </section>
              </aside>
            </div>

            <section className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-5">
              <h3 className="text-lg font-semibold text-amber-100">
                Required Actions
              </h3>
              {requiredActions.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {requiredActions.map((action) => (
                    <li
                      className="rounded-md border border-amber-300/25 bg-slate-950/45 px-4 py-3 text-sm leading-6 text-amber-50"
                      key={action}
                    >
                      {action}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-amber-100/80">
                  No required actions reported.
                </p>
              )}
            </section>
          </div>
        )
      ) : null}
    </section>
  );
}
