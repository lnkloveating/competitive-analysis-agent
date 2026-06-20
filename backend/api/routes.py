from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


def _configure_tracing() -> None:
    """默认关闭 LangSmith tracing，避免无网络/无效 key 时的报错噪音。

    需要时通过 ENABLE_LANGSMITH=true 打开（保留 .env 里的 LANGCHAIN_* 配置）。
    必须在导入 workflow（langchain）之前执行；先 load .env 再按需覆盖，
    后续 agent 内的 load_dotenv(override=False) 不会再覆盖这里已设的值。
    """
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    load_dotenv()
    enabled = os.getenv("ENABLE_LANGSMITH", "").strip().lower() in {"1", "true", "yes", "on"}
    if not enabled:
        for var in ("LANGCHAIN_TRACING_V2", "LANGCHAIN_TRACING", "LANGSMITH_TRACING"):
            os.environ[var] = "false"
        # 移除 key，避免后台上传 trace 时打印鉴权失败噪音
        for var in ("LANGCHAIN_API_KEY", "LANGSMITH_API_KEY"):
            os.environ.pop(var, None)


_configure_tracing()

from orchestration.industry_config import INDUSTRY_CONFIGS, get_state_dimensions, get_state_industry_name
from orchestration.workflow import app as workflow_app
from app.services.error_log_service import normalize_error_log


app = FastAPI(title="竞品分析 Agent 系统", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# 认证模块（独立、最小侵入）。即便认证依赖缺失也不影响分析主流程。
try:
    from auth.router import router as auth_router

    app.include_router(auth_router)

    @app.on_event("startup")
    def _init_auth() -> None:
        try:
            from auth.service import ensure_initialized

            ensure_initialized()
        except Exception:
            # 数据库未就绪时不阻塞主系统启动，登录时再返回明确错误。
            pass
except Exception:  # pragma: no cover - 认证可选，失败不影响分析接口
    pass

# 产品规格事实底座只读接口（搜索/列表/详情/对比）。与分析主流程解耦，仅新增、不改 workflow。
from api.product_routes import router as product_router

app.include_router(product_router)

TASKS: Dict[str, Dict[str, Any]] = {}
TASK_LOCK = threading.Lock()

AGENT_PROGRESS = {
    "ResearchAgent": 12,
    "CollectorAgent": 28,
    "EvidenceAgent": 42,
    "AnalysisAgent": 62,
    "VerificationAgent": 76,
    "QualityAgent": 88,
    "ReportAgent": 100,
}


class AnalysisRequest(BaseModel):
    industry_key: str
    target_platform: str
    competitors: List[str]
    analysis_scene: str
    target_user: str
    time_range: str
    focus_dimensions: List[str]
    # 产品对比页带入的两个产品（{id, model, brand, category}）。可选，兼容旧入口。
    selected_products: Optional[List[Dict[str, Any]]] = None


def _product_input_names(request: AnalysisRequest) -> List[str]:
    names: List[str] = []
    for value in [request.target_platform, *request.competitors]:
        text = str(value or "").strip()
        if text and text not in names:
            names.append(text)
    return names[:2]


def _build_initial_state(request: AnalysisRequest) -> Dict[str, Any]:
    state = request.model_dump()
    selected_inputs = state.pop("selected_products", None) or []
    product_input_names = _product_input_names(request)
    state["industry_name"] = get_state_industry_name(state)
    state["focus_dimensions"] = get_state_dimensions(state)

    compare_mode = bool(selected_inputs) or (
        request.industry_key == "gaming_mouse" and len(product_input_names) >= 2
    )

    state.update(
        {
            "product_compare_mode": compare_mode,
            "selected_products": selected_inputs,
            "original_product_inputs": selected_inputs or product_input_names,
            "resolved_products": [],
            "unresolved_products": [],
            "product_facts": [],
            "data_requirements": [],
            "official_spec_status": [],
            "review_intel_status": {},
            "price_status": {},
            "hardware_analysis": {},
            "experience_analysis": {},
            "business_analysis": {},
            "agent_contributions": [],
            "pending_data": [],
            "pending_dimensions": [],
            "score_flow": {},
            "raw_research": [],
            "evidence_list": [],
            "evidence_status": {},
            "claims": [],
            "product_matrix": {},
            "business_matrix": {},
            "risk_flags": [],
            "faithfulness_report": {},
            "unsupported_claim_ids": [],
            "quality_result": {},
            "final_report": {},
            "context_summary": {},
            "review_ticket": {},
            "trace_log": [],
            "metrics": {},
            "used_claim_ids": [],
            "used_evidence_ids": [],
            "current_agent": "",
            "iteration_count": 0,
            "rejected_agents": [],
            "is_approved": False,
            "needs_human_review": False,
            "degraded_report": False,
            "quality_status": "",
            "error_log": [],
        }
    )
    return state


def _get_task(task_id: str) -> Dict[str, Any]:
    task = TASKS.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="task_id 不存在")
    return task


def _get_task_state(task_id: str) -> Dict[str, Any]:
    with TASK_LOCK:
        task = _get_task(task_id).copy()
        return dict(task.get("state", {}))


def _task_progress(task: Dict[str, Any]) -> int:
    if task.get("status") == "completed":
        return 100
    current_agent = task.get("current_agent", "")
    return AGENT_PROGRESS.get(current_agent, 0)


def _run_workflow(task_id: str, initial_state: Dict[str, Any]) -> None:
    try:
        final_state = dict(initial_state)
        with TASK_LOCK:
            TASKS[task_id]["current_agent"] = "ResearchAgent"

        for event in workflow_app.stream(
            initial_state,
            {"recursion_limit": 50},
            stream_mode="updates",
        ):
            for node_name, update in event.items():
                if not isinstance(update, dict):
                    continue
                final_state.update(update)
                current_agent = update.get("current_agent")
                with TASK_LOCK:
                    TASKS[task_id]["state"] = dict(final_state)
                    if current_agent:
                        TASKS[task_id]["current_agent"] = current_agent

        current_agent = final_state.get("current_agent", "ReportAgent")

        with TASK_LOCK:
            TASKS[task_id].update(
                {
                    "status": "completed",
                    "current_agent": current_agent,
                    "state": final_state,
                    "error": "",
                }
            )
    except Exception as exc:
        with TASK_LOCK:
            task = TASKS.get(task_id)
            if task is not None:
                task.update(
                    {
                        "status": "failed",
                        "state": {**initial_state, **task.get("state", {})},
                        "error": str(exc),
                    }
                )


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/industries")
async def get_industries():
    industries = [
        {
            "key": key,
            "industry_key": key,
            "name": config.get("name", ""),
            "competitors": config.get("competitors", []),
            "representative_products": config.get("representative_products", {}),
            "dimensions": config.get("dimensions", []),
            "description": config.get("description", ""),
            "data_sources": config.get("data_sources", {}),
            "schema_id": config.get("schema_id", ""),
            "schema_model": config.get("schema_model", ""),
            "schema_fields": config.get("schema_fields", []),
        }
        for key, config in INDUSTRY_CONFIGS.items()
    ]
    return {"industries": industries}


@app.post("/api/analysis/start")
async def start_analysis(request: AnalysisRequest):
    task_id = str(uuid4())
    initial_state = _build_initial_state(request)

    with TASK_LOCK:
        TASKS[task_id] = {
            "status": "running",
            "current_agent": "",
            "state": initial_state,
            "error": "",
        }

    thread = threading.Thread(target=_run_workflow, args=(task_id, initial_state), daemon=True)
    thread.start()

    return {"task_id": task_id, "status": "running"}


@app.get("/api/analysis/{task_id}/status")
async def get_status(task_id: str):
    with TASK_LOCK:
        task = _get_task(task_id).copy()
        state = dict(task.get("state", {}))

    return {
        "task_id": task_id,
        "status": task.get("status", "failed"),
        "current_agent": task.get("current_agent", ""),
        "progress": _task_progress(task),
        "quality_status": state.get("quality_status", ""),
        "degraded_report": state.get("degraded_report", False),
        "needs_human_review": state.get("needs_human_review", False),
        "error": task.get("error", ""),
    }


@app.get("/api/analysis/{task_id}/report")
async def get_report(task_id: str):
    with TASK_LOCK:
        task = _get_task(task_id).copy()
        state = dict(task.get("state", {}))

    return {
        "task_id": task_id,
        "status": task.get("status", "failed"),
        "final_report": state.get("final_report", {}),
        "quality_result": state.get("quality_result", {}),
        "quality_status": state.get("quality_status", ""),
        "degraded_report": state.get("degraded_report", False),
        "needs_human_review": state.get("needs_human_review", False),
        "review_ticket": state.get("review_ticket", {}),
        "evidence_list": state.get("evidence_list", []),
        "error": task.get("error", ""),
    }


@app.get("/api/analysis/{task_id}/evidence")
async def get_evidence(task_id: str):
    state = _get_task_state(task_id)
    return {
        "task_id": task_id,
        "evidence_list": state.get("evidence_list", []),
    }


@app.get("/api/analysis/{task_id}/claims")
async def get_claims(task_id: str):
    state = _get_task_state(task_id)
    return {
        "task_id": task_id,
        "claims": state.get("claims", []),
    }


@app.get("/api/analysis/{task_id}/trace")
async def get_trace(task_id: str):
    state = _get_task_state(task_id)
    return {
        "task_id": task_id,
        "trace_log": state.get("trace_log", []),
        "context_summary": state.get("context_summary", {}),
        "error_log": normalize_error_log(state.get("error_log", [])),
        "review_ticket": state.get("review_ticket", {}),
    }


@app.get("/api/analysis/{task_id}/quality")
async def get_quality(task_id: str):
    state = _get_task_state(task_id)
    return {
        "task_id": task_id,
        "quality_result": state.get("quality_result", {}),
        "is_approved": state.get("is_approved", False),
        "iteration_count": state.get("iteration_count", 0),
        "rejected_agents": state.get("rejected_agents", []),
        "needs_human_review": state.get("needs_human_review", False),
        "degraded_report": state.get("degraded_report", False),
        "quality_status": state.get("quality_status", ""),
        "review_ticket": state.get("review_ticket", {}),
    }


@app.get("/api/analysis/{task_id}/errors")
async def get_errors(task_id: str):
    state = _get_task_state(task_id)
    errors = normalize_error_log(state.get("error_log", []))
    return {
        "task_id": task_id,
        "error_log": errors,
        "error_count": len(errors),
    }


@app.get("/api/analysis/{task_id}/metrics")
async def get_metrics(task_id: str):
    state = _get_task_state(task_id)
    return {
        "task_id": task_id,
        "metrics": state.get("metrics", {}),
    }


@app.get("/api/analysis/{task_id}/risks")
async def get_risks(task_id: str):
    state = _get_task_state(task_id)
    return {
        "task_id": task_id,
        "risk_flags": state.get("risk_flags", []),
    }


@app.get("/api/analysis/{task_id}/faithfulness")
async def get_faithfulness(task_id: str):
    state = _get_task_state(task_id)
    return {
        "task_id": task_id,
        "faithfulness_report": state.get("faithfulness_report", {}),
        "unsupported_claim_ids": state.get("unsupported_claim_ids", []),
    }


@app.get("/api/analysis/{task_id}/review-ticket")
async def get_review_ticket(task_id: str):
    state = _get_task_state(task_id)
    return {
        "task_id": task_id,
        "review_ticket": state.get("review_ticket", {}),
        "needs_human_review": state.get("needs_human_review", False),
    }


@app.get("/api/analysis/{task_id}/artifacts")
async def get_artifacts(task_id: str):
    state = _get_task_state(task_id)
    raw_research = state.get("raw_research", [])
    evidence_list = state.get("evidence_list", [])
    claims = state.get("claims", [])
    risk_flags = state.get("risk_flags", [])
    trace_log = state.get("trace_log", [])
    context_summary = state.get("context_summary", {})
    if not isinstance(context_summary, dict):
        context_summary = {}
    errors = normalize_error_log(state.get("error_log", []))

    return {
        "task_id": task_id,
        "raw_research_count": len(raw_research) if isinstance(raw_research, list) else 0,
        "evidence_count": len(evidence_list) if isinstance(evidence_list, list) else 0,
        "claim_count": len(claims) if isinstance(claims, list) else 0,
        "risk_count": len(risk_flags) if isinstance(risk_flags, list) else 0,
        "trace_count": len(trace_log) if isinstance(trace_log, list) else 0,
        "context_agent_count": len(context_summary),
        "context_trimmed_evidence_count": sum(
            int(item.get("trimmed_evidence_count", 0) or 0)
            for item in context_summary.values()
            if isinstance(item, dict)
        ),
        "error_count": len(errors),
        "has_review_ticket": bool(state.get("review_ticket", {})),
        "has_product_matrix": bool(state.get("product_matrix", {})),
        "has_business_matrix": bool(state.get("business_matrix", {})),
        "has_final_report": bool(state.get("final_report", {})),
    }
