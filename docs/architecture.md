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
  └─ Research → Evidence → [Product, Business] → Verification → Risk → Quality ⇄打回 → Strategy
       ↕
豆包 Seed 2.0 + LangSmith + SQLite
```

> 编排说明：所有节点统一经 `app/core/agent_runner.py` 的 `run_node` 执行，提供
> 输出 schema 校验与错误恢复（单个 Agent 异常/校验失败会被记录到 trace_log/error_log
> 并降级恢复，不会中断整个图）。

## Agent 职责

| Agent | 输入 | 输出 | 可被打回 |
|---|---|---|---|
| Research | 用户输入 | 原始信息列表 | ✅ |
| Evidence | 原始信息 | 结构化证据+可信度 | ✅ |
| Product | 证据 | 产品对比矩阵 | ✅ |
| Business | 证据 | 商业对比矩阵 | ✅ |
| Verification | claims+矩阵+证据 | 忠实性报告（剔除疑似幻觉结论） | ❌ |
| Risk | 分析矩阵 | 风险标注 | ❌ |
| Quality | 所有输出 | 通过/打回 | ❌ |
| Strategy | 通过的分析 | 最终报告 | ❌ |

## 幻觉抑制（两层）

1. 引用合法性：每条 claim 的 `evidence_ids` 必须来自真实 `evidence_list`，非法引用被过滤。
2. 引用忠实性（VerificationAgent + `app/services/faithfulness.py`）：校验 claim 文本能否由所引证据推出
   （数字一致性 + 词汇覆盖）。不支撑的 claim 计入 `unsupported_claim_ids`，由 Quality 打回责任 Agent、
   被 Strategy 从最终报告剔除，并在 metrics 暴露 `faithfulness_rate`。

## 上下文管理

`app/services/context_manager.py` 在构造 Product/Business 的 LLM prompt 前，对 evidence 按可信度排序、
按维度限量、按字数截断，避免接入真实爬虫后 prompt 超出上下文窗口。校验与兜底仍基于全量 evidence。
