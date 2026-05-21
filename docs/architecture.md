# 系统架构文档

## 整体架构

```
前端 (React + Vite)
  └─ 5个页面：AnalysisSetup / AgentWorkflow / CompetitiveMatrix / EvidenceTrace / FinalReport
       ↕ HTTP/WebSocket
后端 (FastAPI + Python)
  └─ /api/analysis/start | /status | /report
       ↕
LangGraph Agent 编排
  └─ Research → Evidence → [Product, Business] → Risk → Quality ⇄打回 → Strategy
       ↕
豆包 Seed 2.0 + LangSmith + SQLite
```

## Agent 职责

| Agent | 输入 | 输出 | 可被打回 |
|---|---|---|---|
| Research | 用户输入 | 原始信息列表 | ✅ |
| Evidence | 原始信息 | 结构化证据+可信度 | ✅ |
| Product | 证据 | 产品对比矩阵 | ✅ |
| Business | 证据 | 商业对比矩阵 | ✅ |
| Risk | 分析矩阵 | 风险标注 | ❌ |
| Quality | 所有输出 | 通过/打回 | ❌ |
| Strategy | 通过的分析 | 最终报告 | ❌ |
