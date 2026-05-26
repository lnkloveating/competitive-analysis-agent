# FastAPI 接口文档

本文档面向前端联调，描述当前后端已暴露的分析任务接口和 Agent 工作台只读接口。

默认服务地址：

```text
http://localhost:8000
```

典型调用流程：

1. 调用 `POST /api/analysis/start` 创建分析任务，拿到 `task_id`。
2. 轮询 `GET /api/analysis/{task_id}/status`，直到 `status` 为 `completed` 或 `failed`。
3. 读取报告和中间产物：
   `report`、`evidence`、`claims`、`trace`、`quality`、`metrics`、`risks`、`artifacts`。

通用约定：

- 所有 `{task_id}` 均为 `POST /api/analysis/start` 返回的任务 ID。
- 如果 `task_id` 不存在，任务相关接口返回 `404`。
- 如果某个中间字段尚未生成或不存在，接口返回空数组 `[]` 或空对象 `{}`，不会因为字段缺失返回 `500`。
- `POST /api/analysis/start` 是异步启动 workflow，接口会立即返回，不等待分析完成。

## POST /api/analysis/start

| 项目 | 内容 |
|---|---|
| 用途 | 创建竞品分析任务，并在后台线程启动 LangGraph workflow |
| 请求方法 | `POST` |
| URL | `/api/analysis/start` |
| 请求参数 | JSON body，见下方示例 |
| 404 行为 | 不涉及 `task_id` 查询，正常不会返回 404 |

请求示例：

```json
{
  "industry_key": "gaming_peripherals",
  "target_platform": "罗技",
  "competitors": ["雷蛇", "海盗船"],
  "analysis_scene": "电竞外设竞品分析",
  "target_user": "产品经理",
  "time_range": "近12个月",
  "focus_dimensions": ["硬件性能", "软件驱动", "用户口碑", "定价策略"]
}
```

返回示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "status": "running"
}
```

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `industry_key` | string | 行业配置 key，例如 `gaming_peripherals` |
| `target_platform` | string | 目标品牌或平台 |
| `competitors` | string[] | 竞品列表 |
| `analysis_scene` | string | 分析场景 |
| `target_user` | string | 报告目标用户 |
| `time_range` | string | 时间范围 |
| `focus_dimensions` | string[] | 前端传入关注维度；后端会结合行业配置生成实际分析维度 |

## GET /api/analysis/{task_id}/status

| 项目 | 内容 |
|---|---|
| 用途 | 查询任务执行状态、当前 Agent 和进度 |
| 请求方法 | `GET` |
| URL | `/api/analysis/{task_id}/status` |
| 请求参数 | Path 参数：`task_id` |
| 404 行为 | `task_id` 不存在时返回 `404 {"detail": "task_id 不存在"}` |

返回示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "status": "running",
  "current_agent": "EvidenceAgent",
  "progress": 28,
  "error": ""
}
```

状态说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| `status` | string | `running`、`completed`、`failed` |
| `current_agent` | string | 当前或最近完成的 Agent |
| `progress` | number | 0-100，按当前 Agent 估算 |
| `error` | string | 失败时的错误信息，正常为空字符串 |

## GET /api/analysis/{task_id}/report

| 项目 | 内容 |
|---|---|
| 用途 | 获取最终报告、质检结果和证据列表 |
| 请求方法 | `GET` |
| URL | `/api/analysis/{task_id}/report` |
| 请求参数 | Path 参数：`task_id` |
| 404 行为 | `task_id` 不存在时返回 `404 {"detail": "task_id 不存在"}` |

返回示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "status": "completed",
  "final_report": {
    "quality_status": "approved",
    "needs_human_review": false,
    "executive_summary": "本次报告基于 24 条结构化 claims 和 12 条 evidence 生成...",
    "competitive_ranking": [
      {
        "platform": "罗技",
        "score": 7.4,
        "rank": 1,
        "summary": "罗技优势主要集中在硬件性能、软件驱动（证据：EV001、EV002）"
      }
    ],
    "swot_analysis": {
      "strengths": ["罗技在综合矩阵中处于领先位置（证据：EV001）"],
      "weaknesses": ["当前风险水位未触发 high severity，但仍需保留证据复核机制。"],
      "opportunities": ["把高置信 claims 转化为可持续跟踪的产品与商业指标。"],
      "threats": ["竞品定价、渠道和产品迭代可能改变当前排名。"]
    },
    "strategic_recommendations": [
      {
        "recommendation": "围绕硬件性能优先推进可验证改进（证据：EV001）",
        "supporting_claim_ids": ["PCL001"],
        "supporting_evidence_ids": ["EV001"],
        "confidence_score": 0.85
      }
    ]
  },
  "quality_result": {
    "approved": true,
    "score": 90,
    "status": "approved",
    "quality_score": 90
  },
  "evidence_list": [],
  "error": ""
}
```

## GET /api/industries

| 项目 | 内容 |
|---|---|
| 用途 | 获取后端支持的行业配置列表 |
| 请求方法 | `GET` |
| URL | `/api/industries` |
| 请求参数 | 无 |
| 404 行为 | 不涉及 `task_id` 查询，正常不会返回 404 |

返回示例：

```json
{
  "industries": [
    {
      "key": "gaming_peripherals",
      "name": "电竞外设",
      "competitors": ["罗技", "雷蛇", "海盗船", "SteelSeries"],
      "dimensions": ["硬件性能", "软件驱动", "用户口碑", "定价策略", "产品线广度"],
      "data_sources": {},
      "schema_fields": []
    }
  ]
}
```

## GET /health

| 项目 | 内容 |
|---|---|
| 用途 | 健康检查 |
| 请求方法 | `GET` |
| URL | `/health` |
| 请求参数 | 无 |
| 404 行为 | 不涉及 `task_id` 查询，正常不会返回 404 |

返回示例：

```json
{
  "status": "ok"
}
```

## GET /api/analysis/{task_id}/evidence

| 项目 | 内容 |
|---|---|
| 用途 | 获取 EvidenceAgent 产出的结构化证据列表 |
| 请求方法 | `GET` |
| URL | `/api/analysis/{task_id}/evidence` |
| 请求参数 | Path 参数：`task_id` |
| 404 行为 | `task_id` 不存在时返回 `404 {"detail": "task_id 不存在"}` |

返回示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "evidence_list": [
    {
      "evidence_id": "EV001",
      "platform": "罗技",
      "claim": "罗技在硬件性能维度有公开材料支撑。",
      "source_type": "official",
      "source_title": "罗技硬件性能模拟公开材料",
      "source_url": "mock://logitech/001",
      "publish_time": "近12个月",
      "collected_time": "2026-05-26T10:00:00",
      "credibility": "high",
      "related_dimension": "硬件性能",
      "raw_content": "原始材料摘要...",
      "confidence_score": 0.85
    }
  ]
}
```

字段缺失时：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "evidence_list": []
}
```

## GET /api/analysis/{task_id}/claims

| 项目 | 内容 |
|---|---|
| 用途 | 获取 ProductAgent 和 BusinessAgent 生成的结构化 claims |
| 请求方法 | `GET` |
| URL | `/api/analysis/{task_id}/claims` |
| 请求参数 | Path 参数：`task_id` |
| 404 行为 | `task_id` 不存在时返回 `404 {"detail": "task_id 不存在"}` |

返回示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "claims": [
    {
      "claim_id": "PCL001",
      "content": "罗技在硬件性能维度有证据支持。",
      "dimension": "硬件性能",
      "related_platforms": ["罗技"],
      "evidence_ids": ["EV001"],
      "confidence_score": 0.85,
      "generated_by": "ProductAgent"
    },
    {
      "claim_id": "BCL001",
      "content": "雷蛇在定价策略维度有商业判断证据。",
      "dimension": "定价策略",
      "related_platforms": ["雷蛇"],
      "evidence_ids": ["EV008"],
      "confidence_score": 0.7,
      "generated_by": "BusinessAgent"
    }
  ]
}
```

字段缺失时返回：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "claims": []
}
```

## GET /api/analysis/{task_id}/trace

| 项目 | 内容 |
|---|---|
| 用途 | 获取 Agent 执行轨迹，用于工作台时间线展示 |
| 请求方法 | `GET` |
| URL | `/api/analysis/{task_id}/trace` |
| 请求参数 | Path 参数：`task_id` |
| 404 行为 | `task_id` 不存在时返回 `404 {"detail": "task_id 不存在"}` |

返回示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "trace_log": [
    {
      "step_id": 1,
      "agent_name": "ResearchAgent",
      "status": "success",
      "output_summary": "collected 12 raw research items",
      "error": null
    },
    {
      "step_id": 7,
      "agent_name": "StrategyAgent",
      "status": "success",
      "output_summary": "generated final_report using 5 claims and 12 evidence items",
      "error": null
    }
  ]
}
```

字段缺失时返回：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "trace_log": []
}
```

## GET /api/analysis/{task_id}/quality

| 项目 | 内容 |
|---|---|
| 用途 | 获取 QualityAgent 质检结果和打回状态 |
| 请求方法 | `GET` |
| URL | `/api/analysis/{task_id}/quality` |
| 请求参数 | Path 参数：`task_id` |
| 404 行为 | `task_id` 不存在时返回 `404 {"detail": "task_id 不存在"}` |

返回示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "quality_result": {
    "approved": true,
    "score": 90,
    "reject_to": null,
    "reject_reason": null,
    "missing_dimensions": [],
    "missing_platforms": [],
    "required_actions": [],
    "checked_items": {
      "all_claims_have_evidence": true,
      "all_evidence_ids_valid": true,
      "all_competitors_covered": true,
      "all_dimensions_covered": true,
      "product_matrix_not_empty": true,
      "business_matrix_not_empty": true,
      "no_high_severity_risk": true
    },
    "status": "approved",
    "quality_score": 90
  },
  "is_approved": true,
  "iteration_count": 0,
  "rejected_agents": [],
  "needs_human_review": false,
  "quality_status": "approved"
}
```

人工审核状态示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "quality_result": {
    "approved": false,
    "score": 60,
    "reject_to": "EvidenceAgent",
    "reject_reason": "部分质量检查未通过",
    "required_actions": ["补充缺失维度的 evidence"]
  },
  "is_approved": false,
  "iteration_count": 3,
  "rejected_agents": ["EvidenceAgent", "EvidenceAgent", "EvidenceAgent"],
  "needs_human_review": true,
  "quality_status": "rejected_after_max_iterations"
}
```

字段缺失时会返回：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "quality_result": {},
  "is_approved": false,
  "iteration_count": 0,
  "rejected_agents": [],
  "needs_human_review": false,
  "quality_status": ""
}
```

## GET /api/analysis/{task_id}/metrics

| 项目 | 内容 |
|---|---|
| 用途 | 获取报告质量和覆盖率等指标。当前可能为空对象，预留给后续指标服务 |
| 请求方法 | `GET` |
| URL | `/api/analysis/{task_id}/metrics` |
| 请求参数 | Path 参数：`task_id` |
| 404 行为 | `task_id` 不存在时返回 `404 {"detail": "task_id 不存在"}` |

返回示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "metrics": {
    "evidence_count": 12,
    "claim_count": 24,
    "citation_rate": 1.0,
    "coverage_rate": 1.0,
    "quality_score": 90
  }
}
```

字段缺失时返回：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "metrics": {}
}
```

## GET /api/analysis/{task_id}/risks

| 项目 | 内容 |
|---|---|
| 用途 | 获取 RiskAgent 识别出的风险列表 |
| 请求方法 | `GET` |
| URL | `/api/analysis/{task_id}/risks` |
| 请求参数 | Path 参数：`task_id` |
| 404 行为 | `task_id` 不存在时返回 `404 {"detail": "task_id 不存在"}` |

返回示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "risk_flags": [
    {
      "risk_id": "R001",
      "risk_type": "evidence_gap",
      "description": "雷蛇在定价策略维度缺少可用证据。",
      "severity": "medium",
      "related_platforms": ["雷蛇"],
      "related_dimensions": ["定价策略"],
      "related_evidence_ids": []
    }
  ]
}
```

字段缺失或没有风险时返回：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "risk_flags": []
}
```

## GET /api/analysis/{task_id}/artifacts

| 项目 | 内容 |
|---|---|
| 用途 | 获取完整中间产物摘要，适合工作台顶部统计卡片 |
| 请求方法 | `GET` |
| URL | `/api/analysis/{task_id}/artifacts` |
| 请求参数 | Path 参数：`task_id` |
| 404 行为 | `task_id` 不存在时返回 `404 {"detail": "task_id 不存在"}` |

返回示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "raw_research_count": 12,
  "evidence_count": 12,
  "claim_count": 24,
  "risk_count": 0,
  "trace_count": 7,
  "has_product_matrix": true,
  "has_business_matrix": true,
  "has_final_report": true
}
```

字段缺失时返回示例：

```json
{
  "task_id": "0f7d9b63-7c80-4c08-9f38-0f841d8d4075",
  "raw_research_count": 0,
  "evidence_count": 0,
  "claim_count": 0,
  "risk_count": 0,
  "trace_count": 0,
  "has_product_matrix": false,
  "has_business_matrix": false,
  "has_final_report": false
}
```

## 404 返回格式

所有带 `{task_id}` 的接口，如果任务不存在，返回：

```json
{
  "detail": "task_id 不存在"
}
```

HTTP 状态码为 `404`。

## 前端联调建议

- 创建任务后立即展示 `task_id` 和 `running` 状态。
- 每 1-2 秒轮询 `/status`，`completed` 后停止轮询。
- 工作台页面可以并行请求：
  `/evidence`、`/claims`、`/trace`、`/quality`、`/risks`、`/artifacts`。
- 如果 `/quality` 返回 `needs_human_review: true`，前端应展示“待人工审核”状态，并避免把 `final_report` 当作正式报告展示。
- 如果某个只读接口返回空数组或空对象，表示对应 Agent 还没产出或当前任务没有该类数据。
