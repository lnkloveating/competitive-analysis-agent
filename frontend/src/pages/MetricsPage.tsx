import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../components/common/EmptyState";
import { LoadingState } from "../components/common/LoadingState";
import { MetricCard } from "../components/common/MetricCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { analysisApi } from "../api/analysisApi";
import type { ArtifactsSummary, Metrics, RiskFlag } from "../types/analysis";

type MetricsPageProps = {
  taskId?: string;
  onNavigate: (key: string) => void;
};

const riskTone: Record<string, "danger" | "warning" | "success" | "neutral"> = {
  high: "danger",
  medium: "warning",
  low: "success",
};

function formatMetric(value?: number, kind: "count" | "ratio" | "score" = "count") {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }

  if (kind === "ratio") {
    return `${Math.round(value * 100)}%`;
  }

  if (kind === "score") {
    return value.toFixed(1);
  }

  return value;
}

function ratioPercent(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function ProgressRing({
  label,
  percent,
}: {
  label: string;
  percent: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-5 text-center">
      <div
        className="mx-auto flex h-28 w-28 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(rgb(34 211 238) ${clamped}%, rgb(30 41 59) ${clamped}% 100%)`,
        }}
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-950">
          <span className="text-xl font-semibold text-white">{clamped}%</span>
        </div>
      </div>
      <p className="mt-4 text-sm font-medium text-slate-200">{label}</p>
    </div>
  );
}

function BarMetric({
  label,
  percent,
  tone = "cyan",
}: {
  label: string;
  percent: number;
  tone?: "cyan" | "emerald" | "rose";
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const barClass =
    tone === "emerald"
      ? "bg-emerald-400"
      : tone === "rose"
        ? "bg-rose-400"
        : "bg-cyan-300";

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/45 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-300">{label}</p>
        <p className="text-sm font-semibold text-slate-100">{clamped}%</p>
      </div>
      <div className="mt-3 h-2 rounded-full bg-slate-800">
        <div className={`h-2 rounded-full ${barClass}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

function IdTags({ values }: { values?: string[] }) {
  if (!values || values.length === 0) {
    return <span className="text-sm text-slate-500">None</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <StatusBadge key={value} label={value} tone="neutral" />
      ))}
    </div>
  );
}

export function MetricsPage({ taskId, onNavigate }: MetricsPageProps) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactsSummary | null>(null);
  const [riskFlags, setRiskFlags] = useState<RiskFlag[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      setMetrics(null);
      setArtifacts(null);
      setRiskFlags([]);
      setError(null);
      return;
    }

    const activeTaskId = taskId;
    let cancelled = false;

    async function loadMetrics() {
      setIsLoading(true);
      setError(null);

      try {
        const [metricsResult, artifactsResult, risksResult] = await Promise.all([
          analysisApi.getMetrics(activeTaskId),
          analysisApi.getArtifacts(activeTaskId),
          analysisApi.getRisks(activeTaskId),
        ]);

        if (cancelled) {
          return;
        }

        setMetrics(metricsResult?.metrics ?? {});
        setArtifacts(artifactsResult ?? null);
        setRiskFlags(Array.isArray(risksResult?.risk_flags) ? risksResult.risk_flags : []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load metrics.");
          setMetrics(null);
          setArtifacts(null);
          setRiskFlags([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadMetrics();

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const hasMetrics = useMemo(
    () => Boolean(metrics && Object.keys(metrics).length > 0),
    [metrics],
  );

  if (!taskId) {
    return (
      <section className="mx-auto max-w-6xl">
        <EmptyState
          title="No active task"
          description="Start a gaming_mouse analysis task before opening metrics."
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
      <div className="mb-6">
        <p className="text-sm font-medium text-cyan-300">Metrics</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">
          Metrics Dashboard
        </h2>
        <p className="mt-3 break-all text-sm text-slate-400">Task ID: {taskId}</p>
      </div>

      {isLoading ? <LoadingState label="Loading metrics, artifacts and risks..." /> : null}

      {error ? (
        <div className="mb-5 rounded-md border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {!isLoading && !error ? (
        !hasMetrics ? (
          <EmptyState
            title="No metrics returned yet"
            description="Wait for StrategyAgent to complete, then reopen this page."
          />
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-4">
              <MetricCard
                label="evidence_count"
                value={formatMetric(metrics?.evidence_count)}
                helper="backend metrics"
              />
              <MetricCard
                label="claim_count"
                value={formatMetric(metrics?.claim_count)}
                helper="backend metrics"
              />
              <MetricCard
                label="quality_score"
                value={formatMetric(metrics?.quality_score, "score")}
                helper="quality gate score"
              />
              <MetricCard
                label="iteration_count"
                value={formatMetric(metrics?.iteration_count)}
                helper="repair iterations"
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <ProgressRing
                  label="citation_rate"
                  percent={ratioPercent(metrics?.citation_rate)}
                />
                <ProgressRing
                  label="coverage_rate"
                  percent={ratioPercent(metrics?.coverage_rate)}
                />
              </div>

              <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/70 p-5">
                <h3 className="text-lg font-semibold text-white">Credibility Mix</h3>
                <BarMetric
                  label="high_credibility_ratio"
                  percent={ratioPercent(metrics?.high_credibility_ratio)}
                  tone="emerald"
                />
                <BarMetric
                  label="low_credibility_ratio"
                  percent={ratioPercent(metrics?.low_credibility_ratio)}
                  tone="rose"
                />
                <BarMetric
                  label="citation_rate"
                  percent={ratioPercent(metrics?.citation_rate)}
                />
                <BarMetric
                  label="coverage_rate"
                  percent={ratioPercent(metrics?.coverage_rate)}
                />
                <div className="grid gap-3 pt-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/45 p-4">
                    <p className="text-sm text-slate-400">citation_rate</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-50">
                      {formatMetric(metrics?.citation_rate, "ratio")}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/45 p-4">
                    <p className="text-sm text-slate-400">coverage_rate</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-50">
                      {formatMetric(metrics?.coverage_rate, "ratio")}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
              <h3 className="text-lg font-semibold text-white">Artifacts</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <MetricCard
                  label="raw_research_count"
                  value={artifacts?.raw_research_count ?? "N/A"}
                />
                <MetricCard
                  label="artifact evidence"
                  value={artifacts?.evidence_count ?? "N/A"}
                />
                <MetricCard label="artifact claims" value={artifacts?.claim_count ?? "N/A"} />
                <MetricCard label="risk_count" value={artifacts?.risk_count ?? "N/A"} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge
                  label={`product_matrix ${
                    artifacts?.has_product_matrix ? "ready" : "missing"
                  }`}
                  tone={artifacts?.has_product_matrix ? "success" : "neutral"}
                />
                <StatusBadge
                  label={`business_matrix ${
                    artifacts?.has_business_matrix ? "ready" : "missing"
                  }`}
                  tone={artifacts?.has_business_matrix ? "success" : "neutral"}
                />
                <StatusBadge
                  label={`final_report ${
                    artifacts?.has_final_report ? "ready" : "missing"
                  }`}
                  tone={artifacts?.has_final_report ? "success" : "neutral"}
                />
              </div>
            </section>

            <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
              <h3 className="text-lg font-semibold text-white">Risks</h3>
              {riskFlags.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">No risk flags detected.</p>
              ) : (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {riskFlags.map((risk, index) => (
                    <article
                      className="rounded-lg border border-slate-800 bg-slate-900/45 p-4"
                      key={`${risk.risk_type}-${index}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          label={risk.severity || "unknown"}
                          tone={riskTone[String(risk.severity).toLowerCase()] ?? "neutral"}
                        />
                        <span className="text-sm font-semibold text-white">
                          {risk.risk_type}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-300">
                        {risk.description}
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                            related_platforms
                          </p>
                          <IdTags values={risk.related_platforms} />
                        </div>
                        <div>
                          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                            related_dimensions
                          </p>
                          <IdTags values={risk.related_dimensions} />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )
      ) : null}
    </section>
  );
}
