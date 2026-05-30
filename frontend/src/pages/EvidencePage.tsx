import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../components/common/EmptyState";
import { LoadingState } from "../components/common/LoadingState";
import { MetricCard } from "../components/common/MetricCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { analysisApi } from "../api/analysisApi";
import type { EvidenceItem } from "../types/analysis";

type EvidencePageProps = {
  taskId?: string;
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

function normalizeText(value: string | undefined, fallback = "Unknown") {
  return value && value.trim().length > 0 ? value : fallback;
}

function formatScore(score?: number) {
  return typeof score === "number" ? score.toFixed(2) : "N/A";
}

function EvidenceSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
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
        <option value="all">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function EvidencePage({ taskId, onNavigate }: EvidencePageProps) {
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [filters, setFilters] = useState<EvidenceFilters>(defaultFilters);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      setEvidenceList([]);
      setSelectedEvidenceId(null);
      setFilters(defaultFilters);
      setError(null);
      return;
    }

    const activeTaskId = taskId;
    let cancelled = false;

    async function loadEvidence() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await analysisApi.getEvidence(activeTaskId);
        const nextEvidence = Array.isArray(response?.evidence_list)
          ? response.evidence_list
          : [];

        if (cancelled) {
          return;
        }

        setEvidenceList(nextEvidence);
        setSelectedEvidenceId(nextEvidence[0]?.evidence_id ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load evidence data.",
          );
          setEvidenceList([]);
          setSelectedEvidenceId(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadEvidence();

    return () => {
      cancelled = true;
    };
  }, [taskId]);

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

  const selectedEvidence =
    filteredEvidence.find((item) => item.evidence_id === selectedEvidenceId) ??
    filteredEvidence[0] ??
    evidenceList.find((item) => item.evidence_id === selectedEvidenceId) ??
    null;

  useEffect(() => {
    if (
      filteredEvidence.length > 0 &&
      !filteredEvidence.some((item) => item.evidence_id === selectedEvidenceId)
    ) {
      setSelectedEvidenceId(filteredEvidence[0].evidence_id);
    }
  }, [filteredEvidence, selectedEvidenceId]);

  if (!taskId) {
    return (
      <section className="mx-auto max-w-6xl">
        <EmptyState
          title="No active task"
          description="Start a gaming_mouse analysis task before opening the evidence hub."
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
        <p className="text-sm font-medium text-cyan-300">Evidence Hub</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">
          Evidence Source Ledger
        </h2>
        <p className="mt-3 max-w-3xl break-all text-sm leading-6 text-slate-400">
          Task ID: {taskId}
        </p>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <MetricCard label="Evidence" value={evidenceList.length} helper="from backend" />
        <MetricCard
          label="Filtered"
          value={filteredEvidence.length}
          helper="after active filters"
        />
        <MetricCard
          label="Platforms"
          value={filterOptions.platforms.length}
          helper="observed in evidence"
        />
        <MetricCard
          label="High Credibility"
          value={evidenceList.filter((item) => item.credibility === "high").length}
          helper="credibility = high"
        />
      </div>

      {isLoading ? <LoadingState label="Loading evidence from FastAPI..." /> : null}

      {error ? (
        <div className="mb-5 rounded-md border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {!isLoading && !error ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-5">
            <div className="grid gap-3 md:grid-cols-4">
              <EvidenceSelect
                label="platform"
                onChange={(value) =>
                  setFilters((current) => ({ ...current, platform: value }))
                }
                options={filterOptions.platforms}
                value={filters.platform}
              />
              <EvidenceSelect
                label="dimension"
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
                label="credibility"
                onChange={(value) =>
                  setFilters((current) => ({ ...current, credibility: value }))
                }
                options={filterOptions.credibility}
                value={filters.credibility}
              />
              <EvidenceSelect
                label="source type"
                onChange={(value) =>
                  setFilters((current) => ({ ...current, sourceType: value }))
                }
                options={filterOptions.sourceTypes}
                value={filters.sourceType}
              />
            </div>

            <div className="mt-4 flex justify-end">
              <button
                className="rounded-md border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-cyan-300 hover:text-cyan-100"
                onClick={() => setFilters(defaultFilters)}
                type="button"
              >
                Reset Filters
              </button>
            </div>

            {filteredEvidence.length === 0 ? (
              <div className="mt-5">
                <EmptyState
                  title="No evidence matched"
                  description="Try loosening the active filters."
                />
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {filteredEvidence.map((item) => {
                  const credibility = normalizeText(item.credibility, "unknown");
                  const tone = credibilityTone[credibility] ?? "neutral";
                  const isSelected = selectedEvidence?.evidence_id === item.evidence_id;

                  return (
                    <button
                      className={`w-full rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/70 ${
                        isSelected
                          ? "border-cyan-300/70 bg-cyan-300/10"
                          : "border-slate-800 bg-slate-900/45"
                      }`}
                      key={item.evidence_id}
                      onClick={() => setSelectedEvidenceId(item.evidence_id)}
                      type="button"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm text-cyan-200">
                              {normalizeText(item.evidence_id)}
                            </span>
                            <StatusBadge label={credibility} tone={tone} />
                            <StatusBadge
                              label={normalizeText(item.platform)}
                              tone="neutral"
                            />
                          </div>
                          <h3 className="mt-3 text-base font-semibold text-white">
                            {normalizeText(item.source_title, "Untitled source")}
                          </h3>
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">
                            {normalizeText(item.claim, "No claim text returned.")}
                          </p>
                        </div>
                        <div className="grid gap-2 text-xs text-slate-400 sm:grid-cols-3 lg:min-w-72">
                          <span>{normalizeText(item.related_dimension)}</span>
                          <span>{normalizeText(item.source_type)}</span>
                          <span>score {formatScore(item.confidence_score)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="rounded-lg border border-slate-800 bg-slate-950/80 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Evidence Detail
            </p>
            {selectedEvidence ? (
              <div className="mt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-cyan-200">
                    {normalizeText(selectedEvidence.evidence_id)}
                  </span>
                  <StatusBadge
                    label={normalizeText(selectedEvidence.credibility, "unknown")}
                    tone={
                      credibilityTone[
                        normalizeText(selectedEvidence.credibility, "unknown")
                      ] ?? "neutral"
                    }
                  />
                </div>

                <dl className="mt-5 space-y-4 text-sm">
                  <div>
                    <dt className="text-slate-500">raw_content</dt>
                    <dd className="mt-1 max-h-60 overflow-auto rounded-md border border-slate-800 bg-slate-900/45 p-3 leading-6 text-slate-200">
                      {normalizeText(selectedEvidence.raw_content, "No raw content returned.")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">source_url</dt>
                    <dd className="mt-1 break-all text-cyan-200">
                      {selectedEvidence.source_url ? (
                        <a
                          className="transition hover:text-cyan-100 hover:underline"
                          href={selectedEvidence.source_url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {selectedEvidence.source_url}
                        </a>
                      ) : (
                        "Not reported"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">publish_time</dt>
                    <dd className="mt-1 text-slate-200">
                      {normalizeText(selectedEvidence.publish_time, "Not reported")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">collected_time</dt>
                    <dd className="mt-1 text-slate-200">
                      {normalizeText(selectedEvidence.collected_time, "Not reported")}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-400">
                Select an evidence item to inspect source details.
              </p>
            )}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
