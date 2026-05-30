import { useEffect, useState } from "react";
import { AppLayout } from "./components/layout/AppLayout";
import type { NavItem } from "./components/layout/Sidebar";
import { ClaimsPage } from "./pages/ClaimsPage";
import { EvidencePage } from "./pages/EvidencePage";
import { HomePage } from "./pages/HomePage";
import { MetricsPage } from "./pages/MetricsPage";
import { NewAnalysisPage } from "./pages/NewAnalysisPage";
import { QualityPage } from "./pages/QualityPage";
import { ReportPage } from "./pages/ReportPage";
import { WorkflowPage } from "./pages/WorkflowPage";

type PageKey =
  | "overview"
  | "new-analysis"
  | "workflow"
  | "evidence"
  | "claims"
  | "quality"
  | "report"
  | "metrics";

const navItems: Array<NavItem & { key: PageKey }> = [
  { key: "overview", label: "总览" },
  { key: "new-analysis", label: "新建分析" },
  { key: "workflow", label: "Agent 工作流" },
  { key: "evidence", label: "证据中心" },
  { key: "claims", label: "结论追踪" },
  { key: "quality", label: "质量审查" },
  { key: "report", label: "最终报告" },
  { key: "metrics", label: "指标看板" },
];

function isPageKey(key: string): key is PageKey {
  return navItems.some((item) => item.key === key);
}

function getPageKeyFromHash(): PageKey {
  if (typeof window === "undefined") {
    return "overview";
  }

  const pageKey = window.location.hash.replace(/^#\/?/, "");
  return isPageKey(pageKey) ? pageKey : "overview";
}

function getStoredTaskId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem("activeTaskId");
}

export default function App() {
  const [activePage, setActivePage] = useState<PageKey>(getPageKeyFromHash);
  const [taskId, setTaskId] = useState<string | null>(getStoredTaskId);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedIndustryKey, setSelectedIndustryKey] = useState<string | null>(
    null,
  );

  useEffect(() => {
    function handleHashChange() {
      setActivePage(getPageKeyFromHash());
    }

    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("popstate", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("popstate", handleHashChange);
    };
  }, []);

  function handleNavigate(key: string) {
    if (isPageKey(key)) {
      setActivePage(key);

      if (typeof window !== "undefined" && window.location.hash !== `#${key}`) {
        window.history.pushState(null, "", `#${key}`);
      }
    }
  }

  function handleTaskCreated(nextTaskId: string) {
    setTaskId(nextTaskId);

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("activeTaskId", nextTaskId);
    }
  }

  function handleHomeSelection(selection: {
    selectedDomain?: string | null;
    selectedCategory?: string | null;
    selectedIndustryKey?: string | null;
  }) {
    if ("selectedDomain" in selection) {
      setSelectedDomain(selection.selectedDomain ?? null);
    }

    if ("selectedCategory" in selection) {
      setSelectedCategory(selection.selectedCategory ?? null);
    }

    if ("selectedIndustryKey" in selection) {
      setSelectedIndustryKey(selection.selectedIndustryKey ?? null);
    }
  }

  function renderPage() {
    switch (activePage) {
      case "overview":
        return (
          <HomePage
            onNavigate={handleNavigate}
            onSelectionChange={handleHomeSelection}
            selectedCategory={selectedCategory}
            selectedDomain={selectedDomain}
            selectedIndustryKey={selectedIndustryKey}
            taskId={taskId ?? undefined}
          />
        );
      case "new-analysis":
        return (
          <NewAnalysisPage
            onNavigate={handleNavigate}
            onTaskCreated={handleTaskCreated}
            selectedIndustryKey={selectedIndustryKey}
          />
        );
      case "workflow":
        return <WorkflowPage taskId={taskId ?? undefined} onNavigate={handleNavigate} />;
      case "evidence":
        return <EvidencePage taskId={taskId ?? undefined} onNavigate={handleNavigate} />;
      case "claims":
        return <ClaimsPage taskId={taskId ?? undefined} onNavigate={handleNavigate} />;
      case "quality":
        return <QualityPage taskId={taskId ?? undefined} onNavigate={handleNavigate} />;
      case "report":
        return <ReportPage taskId={taskId ?? undefined} onNavigate={handleNavigate} />;
      case "metrics":
        return <MetricsPage taskId={taskId ?? undefined} onNavigate={handleNavigate} />;
      default:
        return (
          <HomePage
            onNavigate={handleNavigate}
            onSelectionChange={handleHomeSelection}
            selectedCategory={selectedCategory}
            selectedDomain={selectedDomain}
            selectedIndustryKey={selectedIndustryKey}
            taskId={taskId ?? undefined}
          />
        );
    }
  }

  return (
    <AppLayout
      activePage={activePage}
      navItems={navItems}
      onNavigate={handleNavigate}
      taskId={taskId ?? undefined}
    >
      {renderPage()}
    </AppLayout>
  );
}
