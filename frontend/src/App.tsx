import { useState } from "react";
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
  { key: "overview", label: "Overview" },
  { key: "new-analysis", label: "New Analysis" },
  { key: "workflow", label: "Agent Workflow" },
  { key: "evidence", label: "Evidence Hub" },
  { key: "claims", label: "Claims Graph" },
  { key: "quality", label: "Quality Check" },
  { key: "report", label: "Final Report" },
  { key: "metrics", label: "Metrics" },
];

function isPageKey(key: string): key is PageKey {
  return navItems.some((item) => item.key === key);
}

export default function App() {
  const [activePage, setActivePage] = useState<PageKey>("overview");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedIndustryKey, setSelectedIndustryKey] = useState<string | null>(
    null,
  );

  function handleNavigate(key: string) {
    if (isPageKey(key)) {
      setActivePage(key);
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
            onTaskCreated={setTaskId}
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
