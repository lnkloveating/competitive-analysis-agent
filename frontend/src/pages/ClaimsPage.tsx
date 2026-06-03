import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../components/common/EmptyState";
import { LoadingState } from "../components/common/LoadingState";
import { MetricCard } from "../components/common/MetricCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { Tooltip } from "../components/common/Tooltip";
import { analysisApi } from "../api/analysisApi";
import { getCredibilityLabel } from "../utils/labels";
import type { Claim, EvidenceItem } from "../types/analysis";

type ClaimsPageProps = {
  taskId?: string;
  displayTaskId?: string;
  onNavigate: (key: string) => void;
};

type ClaimKind = "PCL" | "BCL" | "Other";

const claimTone: Record<ClaimKind, "info" | "warning" | "neutral"> = {
  PCL: "info",
  BCL: "warning",
  Other: "neutral",
};

const claimCardClasses: Record<ClaimKind, string> = {
  PCL: "border-cyan-300/40",
  BCL: "border-violet-300/40",
  Other: "border-slate-800",
};

const credibilityTone: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  high: "success",
  medium: "warning",
  low: "danger",
};

function normalizeText(value: string | undefined, fallback = "未知") {
  return value && value.trim().length > 0 ? value : fallback;
}

function formatScore(score?: number) {
  return typeof score === "number" ? score.toFixed(2) : "N/A";
}

function getClaimKind(claim: Claim): ClaimKind {
  const claimId = claim.claim_id || "";

  if (claimId.startsWith("PCL") || claim.generated_by === "ProductAgent") {
    return "PCL";
  }

  if (claimId.startsWith("BCL") || claim.generated_by === "BusinessAgent") {
    return "BCL";
  }

  return "Other";
}

function buildEvidenceMap(evidenceList: EvidenceItem[]) {
  return evidenceList.reduce<Record<string, EvidenceItem>>((acc, evidence) => {
    if (evidence.evidence_id) {
      acc[evidence.evidence_id] = evidence;
    }
    return acc;
  }, {});
}

// 悬停证据 ID 时展示该证据的品牌、维度、摘要与可信度。
function EvidenceIdBadge({
  evidenceId,
  evidence,
}: {
  evidenceId: string;
  evidence?: EvidenceItem;
}) {
  if (!evidence) {
    return <StatusBadge label={evidenceId} tone="danger" />;
  }

  return (
    <Tooltip
      width={260}
      content={
        <span className="space-y-1">
          <span className="block font-mono text-[11px] text-cyan-700">
            {evidenceId}
          </span>
          <span className="block">
            <span className="text-slate-400">品牌：</span>
            {normalizeText(evidence.platform)}
          </span>
          <span className="block">
            <span className="text-slate-400">维度：</span>
            {normalizeText(evidence.related_dimension)}
          </span>
          <span className="block">
            <span className="text-slate-400">可信度：</span>
            {getCredibilityLabel(evidence.credibility)}
          </span>
          <span className="block text-slate-500">
            {normalizeText(evidence.claim, "暂无证据摘要。")}
          </span>
        </span>
      }
    >
      <StatusBadge label={evidenceId} tone="success" />
    </Tooltip>
  );
}

export function ClaimsPage({
  taskId,
  displayTaskId,
  onNavigate,
}: ClaimsPageProps) {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      setClaims([]);
      setEvidenceList([]);
      setExpandedIds(new Set());
      setError(null);
      return;
    }

    const activeTaskId = taskId;
    let cancelled = false;
    let timerId: number | undefined;
    let inFlight = false;
    let hasAutoExpanded = false;

    // 结论随 Product/Business Agent 产出；任务运行中先轮询，完成后停止。
    async function refreshClaimsGraph() {
      if (inFlight) {
        return;
      }
      inFlight = true;

      const [statusResult, claimsResult, evidenceResult] = await Promise.allSettled([
        analysisApi.getStatus(activeTaskId),
        analysisApi.getClaims(activeTaskId),
        analysisApi.getEvidence(activeTaskId),
      ]);

      if (cancelled) {
        inFlight = false;
        return;
      }

      const nextClaims =
        claimsResult.status === "fulfilled" && Array.isArray(claimsResult.value?.claims)
          ? claimsResult.value.claims
          : [];
      const nextEvidence =
        evidenceResult.status === "fulfilled" &&
        Array.isArray(evidenceResult.value?.evidence_list)
          ? evidenceResult.value.evidence_list
          : [];

      setClaims(nextClaims);
      setEvidenceList(nextEvidence);
      // 仅在首次拿到结论时自动展开第一条，避免每次轮询覆盖用户的展开状态。
      if (!hasAutoExpanded && nextClaims[0]) {
        setExpandedIds(new Set([nextClaims[0].claim_id]));
        hasAutoExpanded = true;
      }
      setError(
        claimsResult.status === "rejected" && evidenceResult.status === "rejected"
          ? "结论追踪数据加载失败。"
          : null,
      );
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
    refreshClaimsGraph();
    timerId = window.setInterval(refreshClaimsGraph, 1800);

    return () => {
      cancelled = true;
      if (timerId) {
        window.clearInterval(timerId);
      }
    };
  }, [taskId]);

  const evidenceById = useMemo(() => buildEvidenceMap(evidenceList), [evidenceList]);
  const pclCount = claims.filter((claim) => getClaimKind(claim) === "PCL").length;
  const bclCount = claims.filter((claim) => getClaimKind(claim) === "BCL").length;

  function toggleExpanded(claimId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(claimId)) {
        next.delete(claimId);
      } else {
        next.add(claimId);
      }
      return next;
    });
  }

  if (!taskId) {
    return (
      <section className="mx-auto max-w-6xl">
        <EmptyState
          title="暂无任务"
          description="请先启动电竞鼠标分析任务，再打开结论追踪。"
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
    <section className="mx-auto max-w-6xl">
      <div className="mb-6">
        <p className="text-sm font-medium text-cyan-300">结论追踪</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">结论与证据追踪</h2>
        <p className="mt-3 max-w-3xl break-all text-sm leading-6 text-slate-400">
          <span title={`真实任务 ID：${taskId}`}>
            当前任务：{displayTaskId || taskId}
          </span>
        </p>
      </div>

      {/* 关系示意：证据 → 结论 → 报告 */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 px-5 py-4 text-sm">
        <span className="rounded-md border border-emerald-300/40 bg-emerald-400/10 px-3 py-1.5 font-medium text-emerald-700">
          证据 Evidence（{evidenceList.length}）
        </span>
        <span className="text-slate-400">→</span>
        <span className="rounded-md border border-cyan-300/40 bg-cyan-300/10 px-3 py-1.5 font-medium text-cyan-700">
          结论 Claim（{claims.length}）
        </span>
        <span className="text-slate-400">→</span>
        <button
          className="rounded-md border border-violet-300/40 bg-violet-400/10 px-3 py-1.5 font-medium text-violet-700 transition hover:border-violet-400"
          onClick={() => onNavigate("report")}
          type="button"
        >
          最终报告 Report →
        </button>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <MetricCard label="结论总数" value={claims.length} helper="系统返回" />
        <MetricCard label="证据总数" value={evidenceList.length} helper="用于反查证据链" />
        <MetricCard label="PCL 产品结论" value={pclCount} helper="ProductAgent 结论" />
        <MetricCard label="BCL 商业结论" value={bclCount} helper="BusinessAgent 结论" />
      </div>

      {isLoading ? <LoadingState label="正在加载结论与证据链接..." /> : null}

      {error ? (
        <div className="mb-5 rounded-md border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {!isLoading && !error ? (
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
          {claims.length === 0 ? (
            <EmptyState
              title="暂无结论"
              description="请等待 ProductAgent 与 BusinessAgent 完成后再查看。"
            />
          ) : (
            <div className="space-y-3">
              {claims.map((claim) => {
                const kind = getClaimKind(claim);
                const isExpanded = expandedIds.has(claim.claim_id);
                const evidenceIds = claim.evidence_ids ?? [];
                const linkedEvidence = evidenceIds
                  .map((evidenceId) => evidenceById[evidenceId])
                  .filter((item): item is EvidenceItem => Boolean(item));
                const missingEvidenceIds = evidenceIds.filter(
                  (evidenceId) => !evidenceById[evidenceId],
                );

                return (
                  <article
                    className={`rounded-lg border bg-slate-900/45 transition hover:border-cyan-300/60 ${
                      isExpanded ? "ring-1 ring-cyan-300/40" : ""
                    } ${claimCardClasses[kind]}`}
                    key={claim.claim_id}
                  >
                    <button
                      aria-expanded={isExpanded}
                      className="flex w-full items-start justify-between gap-4 p-4 text-left"
                      onClick={() => toggleExpanded(claim.claim_id)}
                      type="button"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm text-white">
                            {normalizeText(claim.claim_id)}
                          </span>
                          <StatusBadge label={kind} tone={claimTone[kind]} />
                          <StatusBadge
                            label={normalizeText(claim.generated_by)}
                            tone="neutral"
                          />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                          <span>分析维度：{normalizeText(claim.dimension)}</span>
                          <span>置信分数：{formatScore(claim.confidence_score)}</span>
                          <span>关联证据：{evidenceIds.length} 条</span>
                        </div>
                        {!isExpanded ? (
                          <p className="mt-2 line-clamp-1 text-sm text-slate-300">
                            {normalizeText(claim.content, "系统暂未返回结论内容。")}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={`mt-1 shrink-0 text-slate-400 transition-transform duration-200 ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                        aria-hidden
                      >
                        ▾
                      </span>
                    </button>

                    {isExpanded ? (
                      <div className="border-t border-slate-800 px-4 pb-4 pt-4">
                        <dl className="space-y-4 text-sm">
                          <div>
                            <dt className="text-slate-500">结论内容</dt>
                            <dd className="mt-1 leading-6 text-slate-200">
                              {normalizeText(
                                claim.content,
                                "系统暂未返回结论内容。",
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">关联品牌</dt>
                            <dd className="mt-2 flex flex-wrap gap-2">
                              {(claim.related_platforms ?? []).length > 0 ? (
                                claim.related_platforms.map((platform) => (
                                  <StatusBadge
                                    key={platform}
                                    label={platform}
                                    tone="neutral"
                                  />
                                ))
                              ) : (
                                <span className="text-slate-400">未返回</span>
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">
                              证据 ID（悬停查看证据详情）
                            </dt>
                            <dd className="mt-2 flex flex-wrap gap-2">
                              {evidenceIds.length > 0 ? (
                                evidenceIds.map((evidenceId) => (
                                  <EvidenceIdBadge
                                    key={evidenceId}
                                    evidenceId={evidenceId}
                                    evidence={evidenceById[evidenceId]}
                                  />
                                ))
                              ) : (
                                <span className="text-slate-400">暂无证据 ID。</span>
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">追溯路径</dt>
                            <dd className="mt-1 break-words font-mono text-xs text-cyan-100">
                              {evidenceIds.length > 0
                                ? `${evidenceIds.join(" + ")} → ${normalizeText(
                                    claim.claim_id,
                                  )} → 报告`
                                : `暂无证据 → ${normalizeText(claim.claim_id)} → 报告`}
                            </dd>
                          </div>
                        </dl>

                        <div className="mt-5 border-t border-slate-800 pt-4">
                          <h4 className="text-sm font-semibold text-white">
                            引用证据摘要
                          </h4>
                          {linkedEvidence.length > 0 ? (
                            <div className="mt-3 space-y-3">
                              {linkedEvidence.map((evidence) => (
                                <div
                                  className="rounded-lg border border-slate-800 bg-slate-950/45 p-4"
                                  key={evidence.evidence_id}
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-sm text-cyan-200">
                                      {normalizeText(evidence.evidence_id)}
                                    </span>
                                    <StatusBadge
                                      label={normalizeText(evidence.platform)}
                                      tone="neutral"
                                    />
                                    <StatusBadge
                                      label={getCredibilityLabel(evidence.credibility)}
                                      tone={
                                        credibilityTone[
                                          (evidence.credibility || "").toLowerCase()
                                        ] ?? "neutral"
                                      }
                                    />
                                  </div>
                                  <h5 className="mt-3 text-sm font-semibold text-white">
                                    {normalizeText(
                                      evidence.source_title,
                                      "未命名来源",
                                    )}
                                  </h5>
                                  <p className="mt-2 text-sm leading-6 text-slate-400">
                                    {normalizeText(
                                      evidence.claim,
                                      "系统暂未返回证据摘要。",
                                    )}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-3 text-sm text-slate-400">
                              当前结论暂未匹配到证据详情。
                            </p>
                          )}

                          {missingEvidenceIds.length > 0 ? (
                            <div className="mt-4 rounded-md border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                              证据列表中缺少这些证据：
                              {missingEvidenceIds.join(", ")}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
