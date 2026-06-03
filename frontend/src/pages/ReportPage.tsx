import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../components/common/EmptyState";
import { InteractiveBars, type BarDatum } from "../components/common/InteractiveBars";
import { LoadingState } from "../components/common/LoadingState";
import { StatusBadge } from "../components/common/StatusBadge";
import { analysisApi } from "../api/analysisApi";
import type {
  FinalReport,
  Metrics,
  QualityResult,
  RiskFlag,
} from "../types/analysis";

type ReportPageProps = {
  taskId?: string;
  displayTaskId?: string;
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
  iteration_count?: number;
  rejected_agents?: string[];
  risk_flags?: RiskFlag[];
  risks?: RiskFlag[];
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

type ReportRisk = RiskFlag & {
  level?: string;
  risk_level?: string;
  message?: string;
  reason?: string;
  content?: string;
};

type Swot = Record<string, string[]>;

type ReportGateState = {
  kind: "official" | "draft" | "human_review" | "risk";
  title: string;
  description: string;
  tone: "success" | "warning" | "danger";
  notice: string;
};

const MAX_RETRY_COUNT = 3;

const swotKeys = ["strengths", "weaknesses", "opportunities", "threats"];

const swotLabels: Record<string, string> = {
  strengths: "优势",
  weaknesses: "劣势",
  opportunities: "机会",
  threats: "威胁",
};

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

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asString(value: unknown, fallback = "未返回") {
  return asOptionalString(value) ?? fallback;
}

function formatUnknownItem(item: unknown): string | null {
  if (typeof item === "string" && item.trim().length > 0) {
    return item;
  }

  if (typeof item === "number" || typeof item === "boolean") {
    return String(item);
  }

  const record = asRecord(item);
  if (Object.keys(record).length === 0) {
    return null;
  }

  return (
    asOptionalString(record.id) ??
    asOptionalString(record.claim_id) ??
    asOptionalString(record.evidence_id) ??
    asOptionalString(record.agent_name) ??
    asOptionalString(record.name) ??
    asOptionalString(record.key) ??
    asOptionalString(record.description) ??
    asOptionalString(record.message) ??
    asOptionalString(record.reason) ??
    asOptionalString(record.content)
  );
}

function asStringList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items
    .map(formatUnknownItem)
    .filter((item): item is string => Boolean(item));
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function mergeUnique(...groups: string[][]): string[] {
  return Array.from(new Set(groups.flat().filter(Boolean)));
}

function normalizeReport(
  response: ReportApiResponse | FinalReport | null,
): FinalReport {
  if (!response) {
    return {};
  }

  const record = asRecord(response);
  return asRecord(record.final_report ?? response);
}

function getQualityResult(
  response: ReportApiResponse | FinalReport | null,
  report: FinalReport,
) {
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
  const recommendations =
    record.strategic_recommendations ?? record.recommendations ?? [];

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

function normalizeRisk(item: unknown): ReportRisk {
  const itemRecord = asRecord(item);
  const severity =
    asOptionalString(itemRecord.severity) ??
    asOptionalString(itemRecord.level) ??
    asOptionalString(itemRecord.risk_level) ??
    "unknown";
  const description =
    asOptionalString(itemRecord.description) ??
    asOptionalString(itemRecord.message) ??
    asOptionalString(itemRecord.reason) ??
    asOptionalString(itemRecord.content) ??
    "系统暂未返回风险描述。";

  return {
    risk_type: asString(itemRecord.risk_type, "unknown"),
    severity,
    level: asOptionalString(itemRecord.level) ?? undefined,
    risk_level: asOptionalString(itemRecord.risk_level) ?? undefined,
    description,
    message: asOptionalString(itemRecord.message) ?? undefined,
    reason: asOptionalString(itemRecord.reason) ?? undefined,
    content: asOptionalString(itemRecord.content) ?? undefined,
    related_platforms: asStringList(itemRecord.related_platforms),
    related_dimensions: asStringList(itemRecord.related_dimensions),
  };
}

function normalizeRisks(report: FinalReport, riskFlags: RiskFlag[]): ReportRisk[] {
  const reportRecord = asRecord(report);
  const reportRisks =
    reportRecord.risk_disclosure ?? reportRecord.risks ?? reportRecord.risk_flags;
  const source = riskFlags.length > 0 ? riskFlags : reportRisks;

  if (!Array.isArray(source)) {
    return [];
  }

  return source.map(normalizeRisk);
}

function getRiskSeverity(risk: ReportRisk) {
  const riskRecord = asRecord(risk);
  return normalizeStatus(
    riskRecord.severity ?? riskRecord.level ?? riskRecord.risk_level,
  );
}

function getQualitySummary(
  response: ReportApiResponse | FinalReport | null,
  report: FinalReport,
  usedClaimIds: string[],
  usedEvidenceIds: string[],
) {
  const responseRecord = asRecord(response);
  const reportRecord = asRecord(report);
  const qualityRecord = getQualityResult(response, report);
  const metricsRecord = asRecord(responseRecord.metrics);
  const rawQualityStatus =
    asOptionalString(responseRecord.quality_status) ??
    asOptionalString(reportRecord.quality_status) ??
    asOptionalString(qualityRecord.status);
  const normalizedQualityStatus = normalizeStatus(rawQualityStatus);
  const needsHumanReview =
    responseRecord.needs_human_review === true ||
    reportRecord.needs_human_review === true ||
    qualityRecord.needs_human_review === true ||
    normalizedQualityStatus.includes("human") ||
    normalizedQualityStatus === "rejected_after_max_iterations" ||
    normalizedQualityStatus === "requires_human_review";

  return {
    status: rawQualityStatus ?? "暂无",
    normalizedStatus: normalizedQualityStatus,
    score:
      asNumber(qualityRecord.score) ??
      asNumber(qualityRecord.quality_score) ??
      asNumber(reportRecord.quality_score) ??
      asNumber(metricsRecord.quality_score),
    iterationCount:
      asNumber(responseRecord.iteration_count) ??
      asNumber(reportRecord.iteration_count) ??
      asNumber(qualityRecord.iteration_count) ??
      asNumber(metricsRecord.iteration_count),
    rejectedAgents: mergeUnique(
      asStringList(responseRecord.rejected_agents),
      asStringList(reportRecord.rejected_agents),
      asStringList(qualityRecord.rejected_agents),
    ),
    needsHumanReview,
    approved:
      asBoolean(qualityRecord.approved) ??
      asBoolean(responseRecord.is_approved) ??
      asBoolean(reportRecord.is_approved),
    usedClaimCount: usedClaimIds.length,
    usedEvidenceCount: usedEvidenceIds.length,
  };
}

function isApprovedStatus(status: string) {
  return ["approved", "pass", "passed", "success"].includes(status);
}

function isRejectedStatus(status: string) {
  return (
    status.includes("reject") ||
    status.includes("fail") ||
    status === "not_approved"
  );
}

function getReportGateState({
  hasHighRisk,
  qualitySummary,
}: {
  hasHighRisk: boolean;
  qualitySummary: ReturnType<typeof getQualitySummary>;
}): ReportGateState {
  const { approved, needsHumanReview, normalizedStatus } = qualitySummary;

  if (needsHumanReview) {
    return {
      kind: "human_review",
      title: "等待人工审核",
      description:
        "自动质量修复已达到上限，当前报告需要人工复核后才能作为正式结果。",
      tone: "warning",
      notice: "等待人工审核后发布正式报告。",
    };
  }

  if (approved === true || isApprovedStatus(normalizedStatus)) {
    return {
      kind: "official",
      title: "正式报告",
      description: "本报告已通过质量门控审查，可作为当前任务的正式输出。",
      tone: "success",
      notice: "",
    };
  }

  if (approved === false || isRejectedStatus(normalizedStatus)) {
    return {
      kind: "draft",
      title: "报告已被质量门控拦截",
      description:
        "当前分析结果未通过质量审查，以下内容仅作为草稿参考，不应作为正式结论使用。",
      tone: "danger",
      notice: "草稿报告，仅供排查和人工审核参考。",
    };
  }

  if (hasHighRisk) {
    return {
      kind: "risk",
      title: "存在高风险项",
      description:
        "RiskAgent 识别到高严重风险，请先处理风险后再使用报告结论。",
      tone: "danger",
      notice: "草稿报告，仅供风险排查和人工审核参考。",
    };
  }

  return {
    kind: "draft",
    title: "草稿报告",
    description:
      "当前报告尚未确认通过质量门控，以下内容仅作为草稿参考。",
    tone: "warning",
    notice: "草稿报告，仅供排查和人工审核参考。",
  };
}

function IdTags({
  ids,
  tone = "neutral",
}: {
  ids: string[];
  tone?: "neutral" | "info";
}) {
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

function ReportGateBanner({
  highRiskCount,
  state,
}: {
  highRiskCount: number;
  state: ReportGateState;
}) {
  const classes =
    state.tone === "success"
      ? "border-emerald-400/35 bg-emerald-400/10 text-emerald-100"
      : state.tone === "danger"
        ? "border-rose-400/35 bg-rose-500/10 text-rose-100"
        : "border-amber-400/35 bg-amber-400/10 text-amber-100";

  return (
    <section className={`rounded-lg border p-5 ${classes}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold">{state.title}</h3>
          <p className="mt-2 text-sm leading-6 opacity-90">{state.description}</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <StatusBadge label={state.title} tone={state.tone} />
          {highRiskCount > 0 ? (
            <StatusBadge label={`高风险 ${highRiskCount} 项`} tone="danger" />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function QualitySummaryCard({
  qualitySummary,
}: {
  qualitySummary: ReturnType<typeof getQualitySummary>;
}) {
  const retryText =
    typeof qualitySummary.iterationCount === "number"
      ? `${qualitySummary.iterationCount} / ${MAX_RETRY_COUNT}`
      : "暂无";
  const scoreText =
    typeof qualitySummary.score === "number"
      ? qualitySummary.score.toFixed(1)
      : "暂无";

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/75 p-5">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">质量审查摘要</h3>
          <p className="mt-1 text-sm text-slate-400">
            汇总 QualityAgent 门控状态与报告引用规模。
          </p>
        </div>
        <StatusBadge
          label={qualitySummary.needsHumanReview ? "需要人工审核" : qualitySummary.status}
          tone={qualitySummary.needsHumanReview ? "warning" : "info"}
        />
      </div>

      <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-slate-800 bg-slate-900/45 p-4">
          <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">
            质量状态
          </dt>
          <dd className="mt-2 break-words text-sm font-semibold text-slate-100">
            {qualitySummary.status}
          </dd>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/45 p-4">
          <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">
            质量得分
          </dt>
          <dd className="mt-2 text-sm font-semibold text-slate-100">
            {scoreText}
          </dd>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/45 p-4">
          <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">
            重试轮次
          </dt>
          <dd className="mt-2 text-sm font-semibold text-slate-100">
            {retryText}
          </dd>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/45 p-4">
          <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">
            是否需要人工审核
          </dt>
          <dd className="mt-2 text-sm font-semibold text-slate-100">
            {qualitySummary.needsHumanReview ? "是" : "否"}
          </dd>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/45 p-4 md:col-span-2">
          <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">
            被打回 Agent
          </dt>
          <dd className="mt-2">
            <IdTags ids={qualitySummary.rejectedAgents} />
          </dd>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/45 p-4">
          <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">
            使用 Claim
          </dt>
          <dd className="mt-2 text-sm font-semibold text-slate-100">
            {qualitySummary.usedClaimCount} 条
          </dd>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/45 p-4">
          <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">
            使用 Evidence
          </dt>
          <dd className="mt-2 text-sm font-semibold text-slate-100">
            {qualitySummary.usedEvidenceCount} 条
          </dd>
        </div>
      </dl>
    </section>
  );
}

function DraftNotice({ state }: { state: ReportGateState }) {
  if (state.kind === "official") {
    return null;
  }

  const classes =
    state.kind === "draft" || state.kind === "risk"
      ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
      : "border-amber-400/35 bg-amber-400/10 text-amber-100";

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${classes}`}>
      {state.notice}
    </div>
  );
}

export function ReportPage({
  taskId,
  displayTaskId,
  onNavigate,
}: ReportPageProps) {
  const [reportResponse, setReportResponse] = useState<
    ReportApiResponse | FinalReport | null
  >(null);
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
    let timerId: number | undefined;
    let inFlight = false;

    // 最终报告在 StrategyAgent / 人工复核阶段才生成；任务运行中先轮询，完成后停止。
    async function refreshReport() {
      if (inFlight) {
        return;
      }
      inFlight = true;

      const [statusResult, reportResult, risksResult] = await Promise.allSettled([
        analysisApi.getStatus(activeTaskId),
        analysisApi.getReport(activeTaskId),
        analysisApi.getRisks(activeTaskId),
      ]);

      if (cancelled) {
        inFlight = false;
        return;
      }

      if (reportResult.status === "fulfilled") {
        setReportResponse(reportResult.value);
        setError(null);
      } else {
        setError(
          reportResult.reason instanceof Error
            ? reportResult.reason.message
            : "报告加载失败。",
        );
      }

      if (risksResult.status === "fulfilled") {
        const risksRecord = asRecord(risksResult.value);
        const riskSource = risksRecord.risk_flags ?? risksRecord.risks;
        setRiskFlags(Array.isArray(riskSource) ? (riskSource as RiskFlag[]) : []);
      }

      setIsLoading(false);
      inFlight = false;

      const taskStatus =
        statusResult.status === "fulfilled"
          ? String(statusResult.value?.status || "").toLowerCase()
          : "";
      if ((taskStatus === "completed" || taskStatus === "failed") && timerId) {
        window.clearInterval(timerId);
        timerId = undefined;
      }
    }

    setIsLoading(true);
    setError(null);
    refreshReport();
    timerId = window.setInterval(refreshReport, 1800);

    return () => {
      cancelled = true;
      if (timerId) {
        window.clearInterval(timerId);
      }
    };
  }, [taskId]);

  const report = useMemo(() => normalizeReport(reportResponse), [reportResponse]);
  const executiveSummary = useMemo(() => normalizeExecutiveSummary(report), [report]);
  const ranking = useMemo(() => normalizeRanking(report), [report]);
  const rankingBars = useMemo<BarDatum[]>(() => {
    const palette: BarDatum["tone"][] = [
      "cyan",
      "violet",
      "emerald",
      "amber",
      "rose",
      "slate",
    ];

    return ranking.map((item, index) => {
      const evidenceIds = item.supporting_evidence_ids ?? [];
      const hasScore = typeof item.score === "number";

      return {
        key: `${item.platform}-${index}`,
        label: `#${item.rank ?? index + 1} ${item.platform ?? "未知"}`,
        value: hasScore ? (item.score as number) : 0,
        display: hasScore ? (item.score as number).toFixed(2) : "未评分",
        tone: palette[index % palette.length],
        tooltip: (
          <span className="space-y-1">
            <span className="block font-semibold text-slate-800">
              {item.platform ?? "未知竞品"}
            </span>
            <span className="block">
              总分：{hasScore ? (item.score as number).toFixed(2) : "未评分"}
            </span>
            {item.summary ? (
              <span className="block text-slate-500">{item.summary}</span>
            ) : null}
            <span className="block text-slate-400">
              支撑证据：
              {evidenceIds.length > 0 ? evidenceIds.join("、") : "暂无"}
            </span>
          </span>
        ),
      };
    });
  }, [ranking]);
  const swot = useMemo(() => normalizeSwot(report), [report]);
  const recommendations = useMemo(() => normalizeRecommendations(report), [report]);
  const risks = useMemo(() => normalizeRisks(report, riskFlags), [report, riskFlags]);
  const usedClaimIds = asStringList(asRecord(report).used_claim_ids);
  const usedEvidenceIds = mergeUnique(
    asStringList(asRecord(report).used_evidence_ids),
    asStringList(asRecord(report).supporting_evidence_ids),
  );
  const qualitySummary = getQualitySummary(
    reportResponse,
    report,
    usedClaimIds,
    usedEvidenceIds,
  );
  const highSeverityRisks = risks.filter((risk) => getRiskSeverity(risk) === "high");
  const reportGateState = getReportGateState({
    hasHighRisk: highSeverityRisks.length > 0,
    qualitySummary,
  });
  const hasReport = Object.keys(report).length > 0;

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
            <span title={`真实任务 ID：${taskId}`}>
              当前任务：{displayTaskId || taskId}
            </span>
          </p>
        </div>
        <StatusBadge label={reportGateState.title} tone={reportGateState.tone} />
      </div>

      {isLoading ? <LoadingState label="正在加载最终报告..." /> : null}

      {error ? (
        <div className="mb-5 rounded-md border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {!isLoading && !error ? (
        <div className="space-y-5">
          <ReportGateBanner
            highRiskCount={highSeverityRisks.length}
            state={reportGateState}
          />
          {highSeverityRisks.length > 0 && reportGateState.kind !== "risk" ? (
            <section className="rounded-lg border border-rose-400/35 bg-rose-500/10 p-5 text-rose-100">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">存在高风险项</h3>
                  <p className="mt-2 text-sm leading-6">
                    RiskAgent 识别到 {highSeverityRisks.length} 个高严重风险，请先处理风险后再使用报告结论。
                  </p>
                </div>
                <StatusBadge
                  label={`高风险 ${highSeverityRisks.length} 项`}
                  tone="danger"
                />
              </div>
            </section>
          ) : null}

          <QualitySummaryCard qualitySummary={qualitySummary} />

          {!hasReport ? (
            <EmptyState
              title={
                reportGateState.kind === "human_review"
                  ? "暂无可展示报告"
                  : "暂无报告"
              }
              description={
                reportGateState.kind === "human_review"
                  ? "暂无可展示报告，等待人工审核处理。"
                  : "请等待 StrategyAgent 完成后再查看。"
              }
            />
          ) : (
            <>
              <DraftNotice state={reportGateState} />

              <div
                className={
                  reportGateState.kind === "official"
                    ? "space-y-5"
                    : "space-y-5 rounded-lg border border-slate-800 bg-slate-950/35 p-4"
                }
              >
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-lg font-semibold text-white">执行摘要</h3>
                    {reportGateState.kind === "official" ? null : (
                      <StatusBadge label="草稿" tone="warning" />
                    )}
                  </div>
                  {executiveSummary.length > 0 ? (
                    <div className="space-y-3">
                      {executiveSummary.map((item) => (
                        <p className="leading-7 text-slate-200" key={item}>
                          {item}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">暂无执行摘要。</p>
                  )}
                </div>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
                  <div className="space-y-5">
                    <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
                      <h3 className="text-lg font-semibold text-white">
                        竞品排名
                      </h3>
                      {ranking.length > 0 ? (
                        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                          <InteractiveBars data={rankingBars} />
                          <p className="mt-3 text-xs text-slate-500">
                            排名依据来自当前结构化 Claim 与 Evidence；悬停查看竞品得分与支撑证据。
                          </p>
                        </div>
                      ) : null}
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
                                    {typeof item.score === "number"
                                      ? item.score.toFixed(2)
                                      : "N/A"}
                                  </span>
                                </p>
                              </div>
                              <div className="mt-4">
                                <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                                  支撑 Evidence
                                </p>
                                <IdTags
                                  ids={item.supporting_evidence_ids ?? []}
                                  tone="info"
                                />
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-slate-400">
                          暂无竞品排名。
                        </p>
                      )}
                    </section>

                    <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
                      <h3 className="text-lg font-semibold text-white">
                        策略建议
                      </h3>
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
                                    支撑 Claim
                                  </p>
                                  <IdTags
                                    ids={item.supporting_claim_ids ?? []}
                                  />
                                </div>
                                <div>
                                  <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                                    支撑 Evidence
                                  </p>
                                  <IdTags
                                    ids={item.supporting_evidence_ids ?? []}
                                    tone="info"
                                  />
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
                      <h3 className="text-lg font-semibold text-white">
                        SWOT 分析
                      </h3>
                      <div className="mt-4 space-y-4">
                        {swotKeys.map((key) => (
                          <div key={key}>
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                              {swotLabels[key]}
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
                      <h3 className="text-lg font-semibold text-white">
                        报告引用追踪
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        以下 ID 用于追溯报告结论对应的结构化 Claim 与 Evidence。
                      </p>
                      <div className="mt-4 grid gap-4">
                        <div>
                          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                            使用的 Claim（{usedClaimIds.length}）
                          </p>
                          <IdTags ids={usedClaimIds} />
                        </div>
                        <div>
                          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                            使用的 Evidence / 支撑证据（
                            {usedEvidenceIds.length})
                          </p>
                          <IdTags ids={usedEvidenceIds} tone="info" />
                        </div>
                      </div>
                    </section>
                  </aside>
                </div>
              </div>

              <section
                className={`rounded-lg border p-5 ${
                  highSeverityRisks.length > 0
                    ? "border-rose-400/35 bg-rose-500/10"
                    : "border-slate-800 bg-slate-950/70"
                }`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">风险提示</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      来自 RiskAgent 的风险披露与严重程度标记。
                    </p>
                  </div>
                  <StatusBadge
                    label={
                      highSeverityRisks.length > 0
                        ? `高风险 ${highSeverityRisks.length} 项`
                        : "暂无高风险"
                    }
                    tone={highSeverityRisks.length > 0 ? "danger" : "success"}
                  />
                </div>

                {risks.length > 0 ? (
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {risks.map((risk, index) => {
                      const severity = getRiskSeverity(risk) || "unknown";
                      const detail =
                        risk.description ||
                        risk.message ||
                        risk.reason ||
                        risk.content ||
                        "系统暂未返回风险描述。";

                      return (
                        <article
                          className="rounded-lg border border-slate-800 bg-slate-900/45 p-4"
                          key={`${risk.risk_type}-${index}`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge
                              label={severity}
                              tone={riskTone[severity] ?? "neutral"}
                            />
                            <span className="text-sm font-semibold text-white">
                              {risk.risk_type}
                            </span>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-300">
                            {detail}
                          </p>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div>
                              <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                                关联品牌
                              </p>
                              <IdTags ids={risk.related_platforms ?? []} />
                            </div>
                            <div>
                              <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                                关联维度
                              </p>
                              <IdTags ids={risk.related_dimensions ?? []} />
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">暂无风险标记。</p>
                )}
              </section>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
