import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../components/common/EmptyState";
import { LoadingState } from "../components/common/LoadingState";
import { MetricCard } from "../components/common/MetricCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { Tooltip } from "../components/common/Tooltip";
import { analysisApi } from "../api/analysisApi";
import {
  getCredibilityExplain,
  getCredibilityLabel,
  getSourceTypeExplain,
  getSourceTypeLabel,
} from "../utils/labels";
import type { Claim, EvidenceItem } from "../types/analysis";

type EvidencePageProps = {
  taskId?: string;
  displayTaskId?: string;
  onNavigate: (key: string) => void;
};

type EvidenceFilters = {
  platform: string;
  relatedDimension: string;
  credibility: string;
  sourceType: string;
};

const defaultFilters: EvidenceFilters = {
  platform: "all",
  relatedDimension: "all",
  credibility: "all",
  sourceType: "all",
};

const credibilityTone: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  high: "success",
  medium: "warning",
  low: "danger",
};

function uniqueValues(items: EvidenceItem[], selector: (item: EvidenceItem) => string) {
  return Array.from(
    new Set(items.map(selector).filter((value) => value && value.trim().length > 0)),
  ).sort((a, b) => a.localeCompare(b));
}

function normalizeText(value: string | undefined, fallback = "未知") {
  return value && value.trim().length > 0 ? value : fallback;
}

function formatScore(score?: number) {
  return typeof score === "number" ? score.toFixed(2) : "N/A";
}

// 悬停可信度徽标时展示解释。
function CredibilityBadge({ credibility }: { credibility: string }) {
  const key = credibility.toLowerCase();
  return (
    <Tooltip
      content={
        <span>
          <span className="font-semibold text-slate-800">
            {getCredibilityLabel(credibility)}
          </span>
          <br />
          {getCredibilityExplain(credibility)}
        </span>
      }
      width={220}
    >
      <StatusBadge
        label={getCredibilityLabel(credibility)}
        tone={credibilityTone[key] ?? "neutral"}
      />
    </Tooltip>
  );
}

function EvidenceSelect({
  label,
  onChange,
  options,
  value,
  renderLabel,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
  renderLabel?: (value: string) => string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      <select
        className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="all">全部</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {renderLabel ? renderLabel(option) : option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function EvidencePage({
  taskId,
  displayTaskId,
  onNavigate,
}: EvidencePageProps) {
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<EvidenceFilters>(defaultFilters);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      setEvidenceList([]);
      setClaims([]);
      setExpandedIds(new Set());
      setFilters(defaultFilters);
      setError(null);
      return;
    }

    const activeTaskId = taskId;
    let cancelled = false;
    let timerId: number | undefined;
    let inFlight = false;

    // 证据随 EvidenceAgent 产出；任务运行中先轮询，完成后停止。
    async function refreshEvidence() {
      if (inFlight) {
        return;
      }
      inFlight = true;

      const [statusResult, evidenceResult, claimsResult] = await Promise.allSettled([
        analysisApi.getStatus(activeTaskId),
        analysisApi.getEvidence(activeTaskId),
        analysisApi.getClaims(activeTaskId),
      ]);

      if (cancelled) {
        inFlight = false;
        return;
      }

      if (evidenceResult.status === "fulfilled") {
        setEvidenceList(
          Array.isArray(evidenceResult.value?.evidence_list)
            ? evidenceResult.value.evidence_list
            : [],
        );
        setError(null);
      } else {
        setError(
          evidenceResult.reason instanceof Error
            ? evidenceResult.reason.message
            : "证据数据加载失败。",
        );
      }

      if (claimsResult.status === "fulfilled") {
        setClaims(
          Array.isArray(claimsResult.value?.claims)
            ? claimsResult.value.claims
            : [],
        );
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
    refreshEvidence();
    timerId = window.setInterval(refreshEvidence, 1800);

    return () => {
      cancelled = true;
      if (timerId) {
        window.clearInterval(timerId);
      }
    };
  }, [taskId]);

  // 反查：每条证据被哪些结论引用。
  const claimIdsByEvidence = useMemo(() => {
    return claims.reduce<Record<string, string[]>>((acc, claim) => {
      (claim.evidence_ids ?? []).forEach((evidenceId) => {
        acc[evidenceId] = [...(acc[evidenceId] ?? []), claim.claim_id];
      });
      return acc;
    }, {});
  }, [claims]);

  const filterOptions = useMemo(
    () => ({
      platforms: uniqueValues(evidenceList, (item) => item.platform),
      dimensions: uniqueValues(evidenceList, (item) => item.related_dimension),
      credibility: uniqueValues(evidenceList, (item) => item.credibility),
      sourceTypes: uniqueValues(evidenceList, (item) => item.source_type),
    }),
    [evidenceList],
  );

  const filteredEvidence = useMemo(
    () =>
      evidenceList.filter((item) => {
        const platformMatch =
          filters.platform === "all" || item.platform === filters.platform;
        const dimensionMatch =
          filters.relatedDimension === "all" ||
          item.related_dimension === filters.relatedDimension;
        const credibilityMatch =
          filters.credibility === "all" || item.credibility === filters.credibility;
        const sourceMatch =
          filters.sourceType === "all" || item.source_type === filters.sourceType;

        return platformMatch && dimensionMatch && credibilityMatch && sourceMatch;
      }),
    [evidenceList, filters],
  );

  function toggleExpanded(evidenceId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(evidenceId)) {
        next.delete(evidenceId);
      } else {
        next.add(evidenceId);
      }
      return next;
    });
  }

  const allExpanded =
    filteredEvidence.length > 0 &&
    filteredEvidence.every((item) => expandedIds.has(item.evidence_id));

  function toggleAll() {
    if (allExpanded) {
      setExpandedIds(new Set());
    } else {
      setExpandedIds(new Set(filteredEvidence.map((item) => item.evidence_id)));
    }
  }

  if (!taskId) {
    return (
      <section className="mx-auto max-w-6xl">
        <EmptyState
          title="暂无任务"
          description="请先启动电竞鼠标分析任务，再打开证据中心。"
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
        <p className="text-sm font-medium text-cyan-300">证据中心</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">证据档案库</h2>
        <p className="mt-3 max-w-3xl break-all text-sm leading-6 text-slate-400">
          <span title={`真实任务 ID：${taskId}`}>
            当前任务：{displayTaskId || taskId}
          </span>
        </p>
        <p className="mt-2 text-xs text-slate-500">
          每条证据默认折叠，点击卡片可展开来源与原文。当前数据用于链路验证，真实爬虫接入后可替换数据来源。
        </p>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <MetricCard label="证据总数" value={evidenceList.length} helper="系统返回" />
        <MetricCard
          label="筛选结果"
          value={filteredEvidence.length}
          helper="当前筛选条件下"
        />
        <MetricCard
          label="品牌数"
          value={filterOptions.platforms.length}
          helper="证据中出现的品牌"
        />
        <MetricCard
          label="高可信证据"
          value={evidenceList.filter((item) => item.credibility === "high").length}
          helper="可信度为高"
        />
      </div>

      {isLoading ? <LoadingState label="正在加载证据数据..." /> : null}

      {error ? (
        <div className="mb-5 rounded-md border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {!isLoading && !error ? (
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <EvidenceSelect
              label="品牌"
              onChange={(value) =>
                setFilters((current) => ({ ...current, platform: value }))
              }
              options={filterOptions.platforms}
              value={filters.platform}
            />
            <EvidenceSelect
              label="分析维度"
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  relatedDimension: value,
                }))
              }
              options={filterOptions.dimensions}
              value={filters.relatedDimension}
            />
            <EvidenceSelect
              label="可信度"
              onChange={(value) =>
                setFilters((current) => ({ ...current, credibility: value }))
              }
              options={filterOptions.credibility}
              renderLabel={getCredibilityLabel}
              value={filters.credibility}
            />
            <EvidenceSelect
              label="来源类型"
              onChange={(value) =>
                setFilters((current) => ({ ...current, sourceType: value }))
              }
              options={filterOptions.sourceTypes}
              renderLabel={getSourceTypeLabel}
              value={filters.sourceType}
            />
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {filteredEvidence.length > 0 ? (
              <button
                className="rounded-md border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-cyan-300 hover:text-cyan-100"
                onClick={toggleAll}
                type="button"
              >
                {allExpanded ? "全部折叠" : "全部展开"}
              </button>
            ) : null}
            <button
              className="rounded-md border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-cyan-300 hover:text-cyan-100"
              onClick={() => setFilters(defaultFilters)}
              type="button"
            >
              重置筛选
            </button>
          </div>

          {filteredEvidence.length === 0 ? (
            <div className="mt-5">
              <EmptyState title="暂无匹配证据" description="请放宽当前筛选条件。" />
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {filteredEvidence.map((item) => {
                const credibility = normalizeText(item.credibility, "unknown");
                const isExpanded = expandedIds.has(item.evidence_id);
                const relatedClaimIds = claimIdsByEvidence[item.evidence_id] ?? [];

                return (
                  <article
                    className={`rounded-lg border transition ${
                      isExpanded
                        ? "border-cyan-300/70 bg-cyan-300/5"
                        : "border-slate-800 bg-slate-900/45 hover:border-cyan-300/50"
                    }`}
                    key={item.evidence_id}
                  >
                    <button
                      aria-expanded={isExpanded}
                      className="flex w-full items-start justify-between gap-4 p-4 text-left"
                      onClick={() => toggleExpanded(item.evidence_id)}
                      type="button"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm text-cyan-200">
                            {normalizeText(item.evidence_id)}
                          </span>
                          <CredibilityBadge credibility={credibility} />
                          <StatusBadge
                            label={normalizeText(item.platform)}
                            tone="neutral"
                          />
                        </div>
                        <h3 className="mt-3 text-base font-semibold text-white">
                          {normalizeText(item.source_title, "未命名来源")}
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                          <span>分析维度：{normalizeText(item.related_dimension)}</span>
                          <Tooltip
                            content={getSourceTypeExplain(item.source_type)}
                            width={220}
                          >
                            <span className="underline decoration-dotted underline-offset-2">
                              来源类型：{getSourceTypeLabel(item.source_type)}
                            </span>
                          </Tooltip>
                          <span>置信分数：{formatScore(item.confidence_score)}</span>
                        </div>
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
                            <dt className="text-slate-500">证据内容</dt>
                            <dd className="mt-1 max-h-60 overflow-auto rounded-md border border-slate-800 bg-slate-950/45 p-3 leading-6 text-slate-200">
                              {normalizeText(item.raw_content, "暂无证据内容。")}
                            </dd>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                              <dt className="text-slate-500">来源链接</dt>
                              <dd className="mt-1 break-all text-cyan-200">
                                {item.source_url ? (
                                  <a
                                    className="transition hover:text-cyan-100 hover:underline"
                                    href={item.source_url}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    {item.source_url}
                                  </a>
                                ) : (
                                  "未返回"
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-slate-500">来源类型</dt>
                              <dd className="mt-1 text-slate-200">
                                {getSourceTypeLabel(item.source_type)}
                                <span className="mt-1 block text-xs text-slate-500">
                                  {getSourceTypeExplain(item.source_type)}
                                </span>
                              </dd>
                            </div>
                            <div>
                              <dt className="text-slate-500">发布时间</dt>
                              <dd className="mt-1 text-slate-200">
                                {normalizeText(item.publish_time, "未返回")}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-slate-500">采集时间</dt>
                              <dd className="mt-1 text-slate-200">
                                {normalizeText(item.collected_time, "未返回")}
                              </dd>
                            </div>
                          </div>
                          <div>
                            <dt className="text-slate-500">关联结论</dt>
                            <dd className="mt-2">
                              {relatedClaimIds.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {relatedClaimIds.map((claimId) => (
                                    <StatusBadge
                                      key={claimId}
                                      label={claimId}
                                      tone="info"
                                    />
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-400">
                                  暂无结论引用该证据。
                                </span>
                              )}
                            </dd>
                          </div>
                        </dl>
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
