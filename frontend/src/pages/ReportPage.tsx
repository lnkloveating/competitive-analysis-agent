import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../components/common/EmptyState";
import { LoadingState } from "../components/common/LoadingState";
import { StatusBadge } from "../components/common/StatusBadge";
import { analysisApi } from "../api/analysisApi";
import type { FinalReport, Metrics, QualityResult, RiskFlag } from "../types/analysis";

type ReportPageProps = {
  taskId?: string;
  onNavigate: (key: string) => void;
};

type ReportApiResponse = {
  task_id?: string;
  status?: string;
  final_report?: FinalReport;
  quality_result?: QualityResult;
  metrics?: Metrics;
  needs_human_review?: boolean;
  quality_status?: string;
  error?: string;
};

type RankingItem = {
  platform?: string;
  rank?: number;
  score?: number;
  summary?: string;
  supporting_evidence_ids?: string[];
};

type RecommendationItem = {
  recommendation?: string;
  supporting_claim_ids?: string[];
  supporting_evidence_ids?: string[];
  confidence_score?: number;
};

type Swot = Record<string, string[]>;

const swotKeys = ["strengths", "weaknesses", "opportunities", "threats"];

const riskTone: Record<string, "danger" | "warning" | "success" | "neutral"> = {
  high: "danger",
  medium: "warning",
  low: "success",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = "未返回") {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : String(item ?? "")))
      .filter((item) => item.trim().length > 0);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return [value];
  }

  return [];
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeReport(response: ReportApiResponse | FinalReport | null): FinalReport {
  if (!response) {
    return {};
  }

  const record = asRecord(response);
  return asRecord(record.final_report ?? response);
}

function getQualityResult(response: ReportApiResponse | FinalReport | null, report: FinalReport) {
  const responseRecord = asRecord(response);
  const reportRecord = asRecord(report);
  return asRecord(responseRecord.quality_result ?? reportRecord.quality_result);
}

function normalizeExecutiveSummary(report: FinalReport): string[] {
  return asStringList(asRecord(report).executive_summary);
}

function normalizeRanking(report: FinalReport): RankingItem[] {
  const record = asRecord(report);
  const ranking = record.competitor_ranking ?? record.competitive_ranking ?? [];

  if (!Array.isArray(ranking)) {
    return [];
  }

  return ranking.map((item) => {
    const itemRecord = asRecord(item);
    return {
      platform: asString(itemRecord.platform, "未知平台"),
      rank: asNumber(itemRecord.rank),
      score: asNumber(itemRecord.score),
      summary: asString(itemRecord.summary, ""),
      supporting_evidence_ids: asStringList(itemRecord.supporting_evidence_ids),
    };
  });
}

function normalizeSwot(report: FinalReport): Swot {
  const record = asRecord(report);
  const swot = asRecord(record.swot ?? record.swot_analysis);

  return swotKeys.reduce<Swot>((acc, key) => {
    acc[key] = asStringList(swot[key]);
    return acc;
  }, {});
}

function normalizeRecommendations(report: FinalReport): RecommendationItem[] {
  const record = asRecord(report);
  const recommendations = record.strategic_recommendations ?? record.recommendations ?? [];

  if (!Array.isArray(recommendations)) {
    return [];
  }

  return recommendations.map((item) => {
    const itemRecord = asRecord(item);
    return {
      recommendation: asString(itemRecord.recommendation, "未返回"),
      supporting_claim_ids: asStringList(itemRecord.supporting_claim_ids),
      supporting_evidence_ids: asStringList(itemRecord.supporting_evidence_ids),
      confidence_score: asNumber(itemRecord.confidence_score),
    };
  });
}

function normalizeRisks(report: FinalReport, riskFlags: RiskFlag[]): RiskFlag[] {
  if (riskFlags.length > 0) {
    return riskFlags;
  }

  const reportRisks = asRecord(report).risk_disclosure ?? asRecord(report).risks ?? [];
  if (!Array.isArray(reportRisks)) {
    return [];
  }

  return reportRisks.map((item) => {
    const itemRecord = asRecord(item);
    return {
      risk_type: asString(itemRecord.risk_type, "unknown"),
      severity: asString(itemRecord.severity, "unknown"),
      description: asString(itemRecord.description, "后端未返回风险描述。"),
      related_platforms: asStringList(itemRecord.related_platforms),
      related_dimensions: asStringList(itemRecord.related_dimensions),
    };
  });
}

function isHumanReviewRequired(
  response: ReportApiResponse | FinalReport | null,
  report: FinalReport,
) {
  const responseRecord = asRecord(response);
  const reportRecord = asRecord(report);
  const qualityRecord = getQualityResult(response, report);
  const qualityStatus =
    responseRecord.quality_status ?? reportRecord.quality_status ?? qualityRecord.status;

  return (
    responseRecord.needs_human_review === true ||
    reportRecord.needs_human_review === true ||
    qualityRecord.needs_human_review === true ||
    qualityStatus === "rejected_after_max_iterations" ||
    qualityStatus === "requires_human_review"
  );
}

function IdTags({ ids, tone = "neutral" }: { ids: string[]; tone?: "neutral" | "info" }) {
  if (ids.length === 0) {
    return <span className="text-sm text-slate-500">无</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <StatusBadge key={id} label={id} tone={tone} />
      ))}
    </div>
  );
}

export function ReportPage({ taskId, onNavigate }: ReportPageProps) {
  const [reportResponse, setReportResponse] = useState<ReportApiResponse | FinalReport | null>(null);
  const [riskFlags, setRiskFlags] = useState<RiskFlag[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      setReportResponse(null);
      setRiskFlags([]);
      setError(null);
      return;
    }

    const activeTaskId = taskId;
    let cancelled = false;

    async function loadReport() {
      setIsLoading(true);
      setError(null);

      try {
        const [reportResult, risksResult] = await Promise.all([
          analysisApi.getReport(activeTaskId),
          analysisApi.getRisks(activeTaskId),
        ]);

        if (cancelled) {
          return;
        }

        setReportResponse(reportResult);
        setRiskFlags(Array.isArray(risksResult?.risk_flags) ? risksResult.risk_flags : []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "报告加载失败。");
          setReportResponse(null);
          setRiskFlags([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadReport();

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const report = useMemo(() => normalizeReport(reportResponse), [reportResponse]);
  const executiveSummary = useMemo(() => normalizeExecutiveSummary(report), [report]);
  const ranking = useMemo(() => normalizeRanking(report), [report]);
  const swot = useMemo(() => normalizeSwot(report), [report]);
  const recommendations = useMemo(() => normalizeRecommendations(report), [report]);
  const risks = useMemo(() => normalizeRisks(report, riskFlags), [report, riskFlags]);
  const usedClaimIds = asStringList(asRecord(report).used_claim_ids);
  const usedEvidenceIds = asStringList(asRecord(report).used_evidence_ids);
  const humanReviewRequired = isHumanReviewRequired(reportResponse, report);
  const reportStatus = asString(asRecord(report).quality_status, asString(asRecord(reportResponse).status, "unknown"));

  if (!taskId) {
    return (
      <section className="mx-auto max-w-6xl">
        <EmptyState
          title="暂无任务"
          description="请先启动 gaming_mouse 分析任务，再打开最终报告。"
          action={
            <button
              className="rounded-md bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
              onClick={() => onNavigate("new-analysis")}
              type="button"
            >
              新建分析
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
          <p className="text-sm font-medium text-cyan-300">最终报告</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">
            竞品策略报告
          </h2>
          <p className="mt-3 max-w-3xl break-all text-sm leading-6 text-slate-400">
            当前任务: {taskId}
          </p>
        </div>
        <StatusBadge
          label={humanReviewRequired ? "人工审核" : reportStatus}
          tone={humanReviewRequired ? "warning" : "success"}
        />
      </div>

      {isLoading ? <LoadingState label="正在从 FastAPI 加载最终报告..." /> : null}

      {error ? (
        <div className="mb-5 rounded-md border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {!isLoading && !error ? (
        Object.keys(report).length === 0 ? (
          <EmptyState
            title="暂无报告"
            description="请等待 StrategyAgent 完成后再查看。"
          />
        ) : (
          <div className="space-y-5">
            {humanReviewRequired ? (
              <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-5 text-amber-100">
                <h3 className="text-base font-semibold">
                  当前报告需要人工审核。
                </h3>
                <p className="mt-2 text-sm leading-6">
                  当前报告未通过自动质检，仅作为低置信草稿。
                </p>
              </div>
            ) : null}

            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
              <h3 className="text-lg font-semibold text-white">执行摘要</h3>
              {executiveSummary.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {executiveSummary.map((item) => (
                    <p className="leading-7 text-slate-200" key={item}>
                      {item}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-400">暂无执行摘要。</p>
              )}
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-5">
                <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
                  <h3 className="text-lg font-semibold text-white">竞品排名</h3>
                  {ranking.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {ranking.map((item, index) => (
                        <article
                          className="rounded-lg border border-slate-800 bg-slate-900/45 p-4"
                          key={`${item.platform}-${index}`}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge
                                  label={`#${item.rank ?? index + 1}`}
                                  tone="info"
                                />
                                <h4 className="text-base font-semibold text-white">
                                  {item.platform}
                                </h4>
                              </div>
                              <p className="mt-3 text-sm leading-6 text-slate-300">
                                {item.summary || "暂无排名摘要。"}
                              </p>
                            </div>
                            <p className="text-sm text-slate-300">
                              分数{" "}
                              <span className="font-semibold text-cyan-200">
                                {typeof item.score === "number" ? item.score.toFixed(2) : "N/A"}
                              </span>
                            </p>
                          </div>
                          <div className="mt-4">
                            <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                              supporting_evidence_ids
                            </p>
                            <IdTags ids={item.supporting_evidence_ids ?? []} tone="info" />
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-400">暂无竞品排名。</p>
                  )}
                </section>

                <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
                  <h3 className="text-lg font-semibold text-white">策略建议</h3>
                  {recommendations.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {recommendations.map((item, index) => (
                        <article
                          className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 p-4"
                          key={`${item.recommendation}-${index}`}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <p className="leading-7 text-slate-100">
                              {item.recommendation}
                            </p>
                            <p className="shrink-0 text-sm text-cyan-100">
                              置信度{" "}
                              {typeof item.confidence_score === "number"
                                ? item.confidence_score.toFixed(2)
                                : "N/A"}
                            </p>
                          </div>
                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <div>
                              <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                                supporting_claim_ids
                              </p>
                              <IdTags ids={item.supporting_claim_ids ?? []} tone="neutral" />
                            </div>
                            <div>
                              <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                                supporting_evidence_ids
                              </p>
                              <IdTags ids={item.supporting_evidence_ids ?? []} tone="info" />
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-400">
                      暂无策略建议。
                    </p>
                  )}
                </section>
              </div>

              <aside className="space-y-5">
                <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-5">
                  <h3 className="text-lg font-semibold text-white">SWOT 分析</h3>
                  <div className="mt-4 space-y-4">
                    {swotKeys.map((key) => (
                      <div key={key}>
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          {key}
                        </p>
                        {swot[key]?.length > 0 ? (
                          <div className="mt-2 space-y-2">
                            {swot[key].map((item) => (
                              <p
                                className="rounded-md border border-slate-800 bg-slate-900/45 px-3 py-2 text-sm leading-6 text-slate-200"
                                key={item}
                              >
                                {item}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-slate-500">无</p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-slate-800 bg-slate-950/80 p-5">
                  <h3 className="text-lg font-semibold text-white">引用链路</h3>
                  <div className="mt-4">
                    <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                      used_claim_ids
                    </p>
                    <IdTags ids={usedClaimIds} />
                  </div>
                  <div className="mt-5">
                    <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                      used_evidence_ids
                    </p>
                    <IdTags ids={usedEvidenceIds} tone="info" />
                  </div>
                </section>
              </aside>
            </div>

            <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
              <h3 className="text-lg font-semibold text-white">风险披露</h3>
              {risks.length > 0 ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {risks.map((risk, index) => (
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
                            platforms
                          </p>
                          <IdTags ids={risk.related_platforms ?? []} />
                        </div>
                        <div>
                          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                            dimensions
                          </p>
                          <IdTags ids={risk.related_dimensions ?? []} />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-400">暂无风险标记。</p>
              )}
            </section>
          </div>
        )
      ) : null}
    </section>
  );
}
