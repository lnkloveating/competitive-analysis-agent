from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

app = FastAPI(title="竞品分析 Agent 系统", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class AnalysisRequest(BaseModel):
    target_platform: str
    competitors: List[str]
    analysis_scene: str
    target_user: str
    time_range: str
    focus_dimensions: List[str]

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/api/analysis/start")
async def start_analysis(request: AnalysisRequest):
    return {"task_id": "task_001", "status": "started"}

@app.get("/api/analysis/{task_id}/status")
async def get_status(task_id: str):
    return {"task_id": task_id, "current_agent": "ResearchAgent", "progress": 0}

@app.get("/api/analysis/{task_id}/report")
async def get_report(task_id: str):
    return {"task_id": task_id, "report": None}
