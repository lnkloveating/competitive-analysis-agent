import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../components/common/EmptyState";
import { LoadingState } from "../components/common/LoadingState";
import { MetricCard } from "../components/common/MetricCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { analysisApi } from "../api/analysisApi";
import type { Claim, EvidenceItem } from "../types/analysis";

type ClaimsPageProps = {
  taskId?: string;
  onNavigate: (key: string) => void;
};

type ClaimKind = "PCL" | "BCL" | "Other";

const claimTone: Record<ClaimKind, "info" | "warning" | "neutral"> = {
  PCL: "info",
  BCL: "warning",
  Other: "neutral",
};

const claimCardClasses: Record<ClaimKind, string> = {
  PCL: "border-cyan-300/40 bg-cyan-300/10",
  BCL: "border-violet-300/40 bg-violet-400/10",
  Other: "border-slate-800 bg-slate-900/45",
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

export function ClaimsPage({ taskId, onNavigate }: ClaimsPageProps) {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      setClaims([]);
      setEvidenceList([]);
      setSelectedClaimId(null);
      setError(null);
      return;
    }

    const activeTaskId = taskId;
    let cancelled = false;

    async function loadClaimsGraph() {
      setIsLoading(true);
      setError(null);

      try {
        const [claimsResponse, evidenceResponse] = await Promise.all([
          analysisApi.getClaims(activeTaskId),
          analysisApi.getEvidence(activeTaskId),
        ]);

        const nextClaims = Array.isArray(claimsResponse?.claims)
          ? claimsResponse.claims
          : [];
        const nextEvidence = Array.isArray(evidenceResponse?.evidence_list)
          ? evidenceResponse.evidence_list
          : [];

        if (cancelled) {
          return;
        }

        setClaims(nextClaims);
        setEvidenceList(nextEvidence);
        setSelectedClaimId(nextClaims[0]?.claim_id ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "结论追踪数据加载失败。",
          );
          setClaims([]);
          setEvidenceList([]);
          setSelectedClaimId(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadClaimsGraph();

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const evidenceById = useMemo(() => buildEvidenceMap(evidenceList), [evidenceList]);
  const selectedClaim =
    claims.find((claim) => claim.claim_id === selectedClaimId) ?? claims[0] ?? null;
  const selectedEvidenceIds = selectedClaim?.evidence_ids ?? [];
  const linkedEvidence = selectedEvidenceIds
    .map((evidenceId) => evidenceById[evidenceId])
    .filter((item): item is EvidenceItem => Boolean(item));
  const missingEvidenceIds = selectedEvidenceIds.filter(
    (evidenceId) => !evidenceById[evidenceId],
  );
  const pclCount = claims.filter((claim) => getClaimKind(claim) === "PCL").length;
  const bclCount = claims.filter((claim) => getClaimKind(claim) === "BCL").length;

  if (!taskId) {
    return (
      <section className="mx-auto max-w-6xl">
        <EmptyState
          title="暂无任务"
          description="请先启动 gaming_mouse 分析任务，再打开结论追踪。"
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
      <div className="mb-6">
        <p className="text-sm font-medium text-cyan-300">结论追踪</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">
          结论与证据追踪
        </h2>
        <p className="mt-3 max-w-3xl break-all text-sm leading-6 text-slate-400">
          当前任务: {taskId}
        </p>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <MetricCard label="结论总数" value={claims.length} helper="来自后端" />
        <MetricCard label="证据总数" value={evidenceList.length} helper="用于反查证据链" />
        <MetricCard label="PCL" value={pclCount} helper="ProductAgent 结论" />
        <MetricCard label="BCL" value={bclCount} helper="BusinessAgent 结论" />
      </div>

      {isLoading ? <LoadingState label="正在加载结论与证据链接..." /> : null}

      {error ? (
        <div className="mb-5 rounded-md border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {!isLoading && !error ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
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
                  const isSelected = selectedClaim?.claim_id === claim.claim_id;
                  const evidenceIds = claim.evidence_ids ?? [];

                  return (
                    <button
                      className={`w-full rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/70 ${claimCardClasses[kind]} ${
                        isSelected ? "ring-2 ring-cyan-300/60" : ""
                      }`}
                      key={claim.claim_id}
                      onClick={() => setSelectedClaimId(claim.claim_id)}
                      type="button"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
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
                          <p className="mt-3 text-sm leading-6 text-slate-100">
                            {normalizeText(claim.content, "后端未返回结论内容。")}
                          </p>
                        </div>
                        <div className="lg:min-w-72">
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            dimension
                          </p>
                          <p className="mt-1 text-sm text-slate-200">
                            {normalizeText(claim.dimension)}
                          </p>
                          <p className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-500">
                            confidence
                          </p>
                          <p className="mt-1 text-sm text-slate-200">
                            {formatScore(claim.confidence_score)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 rounded-md border border-slate-700/70 bg-slate-950/55 px-3 py-2">
                        <p className="text-xs text-slate-500">证据链路</p>
                        <p className="mt-1 break-words font-mono text-sm text-cyan-100">
                          {evidenceIds.length > 0
                            ? `${evidenceIds.join(" + ")} -> ${normalizeText(
                                claim.claim_id,
                              )}`
                            : `暂无 evidence_ids -> ${normalizeText(claim.claim_id)}`}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="rounded-lg border border-slate-800 bg-slate-950/80 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              结论详情
            </p>
            {selectedClaim ? (
              <div className="mt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-cyan-200">
                    {normalizeText(selectedClaim.claim_id)}
                  </span>
                  <StatusBadge
                    label={getClaimKind(selectedClaim)}
                    tone={claimTone[getClaimKind(selectedClaim)]}
                  />
                </div>

                <dl className="mt-5 space-y-4 text-sm">
                  <div>
                    <dt className="text-slate-500">结论内容</dt>
                    <dd className="mt-1 leading-6 text-slate-200">
                      {normalizeText(selectedClaim.content, "后端未返回结论内容。")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">related_platforms</dt>
                    <dd className="mt-2 flex flex-wrap gap-2">
                      {(selectedClaim.related_platforms ?? []).length > 0 ? (
                        selectedClaim.related_platforms.map((platform) => (
                          <StatusBadge key={platform} label={platform} tone="neutral" />
                        ))
                      ) : (
                        <span className="text-slate-400">未返回</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">evidence_ids</dt>
                    <dd className="mt-2 flex flex-wrap gap-2">
                      {selectedEvidenceIds.length > 0 ? (
                        selectedEvidenceIds.map((evidenceId) => (
                          <StatusBadge
                            key={evidenceId}
                            label={evidenceId}
                            tone={evidenceById[evidenceId] ? "success" : "danger"}
                          />
                        ))
                      ) : (
                        <span className="text-slate-400">暂无 evidence_ids。</span>
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="mt-6 border-t border-slate-800 pt-5">
                  <h3 className="text-sm font-semibold text-white">
                    引用证据
                  </h3>
                  {linkedEvidence.length > 0 ? (
                    <div className="mt-3 space-y-3">
                      {linkedEvidence.map((evidence) => (
                        <article
                          className="rounded-lg border border-slate-800 bg-slate-900/45 p-4"
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
                              label={normalizeText(evidence.credibility, "unknown")}
                              tone={
                                evidence.credibility === "high"
                                  ? "success"
                                  : evidence.credibility === "medium"
                                    ? "warning"
                                    : evidence.credibility === "low"
                                      ? "danger"
                                      : "neutral"
                              }
                            />
                          </div>
                          <h4 className="mt-3 text-sm font-semibold text-white">
                            {normalizeText(evidence.source_title, "未命名来源")}
                          </h4>
                          <p className="mt-2 text-sm leading-6 text-slate-400">
                            {normalizeText(evidence.claim, "后端未返回证据摘要。")}
                          </p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-400">
                      当前结论暂未匹配到证据详情。
                    </p>
                  )}

                  {missingEvidenceIds.length > 0 ? (
                    <div className="mt-4 rounded-md border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                      evidence_list 中缺少这些证据: {missingEvidenceIds.join(", ")}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-400">
                请选择一条结论查看证据来源。
              </p>
            )}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
