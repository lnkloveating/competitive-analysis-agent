import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from fastapi.testclient import TestClient


os.environ["LANGCHAIN_TRACING_V2"] = "false"
os.environ["LANGSMITH_TRACING"] = "false"
os.environ["RESEARCH_AGENT_USE_LLM"] = "0"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
load_dotenv(Path(__file__).resolve().parent / ".env")

from agents.industry_config import INDUSTRY_CONFIGS
from api.routes import app
from app.schemas.research import RawResearchItem
from app.services.mock_research_provider import MockResearchProvider


EXPECTED_COMPETITORS = {"罗技", "雷蛇", "海盗船"}
EXPECTED_DIMENSIONS = {
    "性能参数",
    "轻量化设计",
    "无线与续航",
    "软件生态",
    "用户口碑",
    "价格定位",
    "电竞品牌影响力",
}


if __name__ == "__main__":
    config = INDUSTRY_CONFIGS.get("gaming_mouse", {})
    assert config, "INDUSTRY_CONFIGS 缺少 gaming_mouse"
    assert EXPECTED_COMPETITORS.issubset(set(config.get("competitors", [])))
    assert EXPECTED_DIMENSIONS.issubset(set(config.get("dimensions", [])))

    client = TestClient(app)
    response = client.get("/api/industries")
    assert response.status_code == 200
    industries = response.json()["industries"]
    gaming_mouse = next(
        (
            item
            for item in industries
            if item.get("industry_key") == "gaming_mouse" or item.get("key") == "gaming_mouse"
        ),
        None,
    )
    assert gaming_mouse, "/api/industries 未返回 gaming_mouse"
    assert gaming_mouse["name"] == "电竞鼠标"
    assert EXPECTED_COMPETITORS.issubset(set(gaming_mouse.get("competitors", [])))
    assert EXPECTED_DIMENSIONS.issubset(set(gaming_mouse.get("dimensions", [])))

    state = {
        "industry_key": "gaming_mouse",
        "industry_name": "电竞鼠标",
        "target_platform": "罗技",
        "competitors": ["雷蛇", "海盗船"],
        "analysis_scene": "电竞鼠标竞品分析",
        "target_user": "产品经理",
        "time_range": "近12个月",
        "focus_dimensions": list(config["dimensions"]),
    }
    raw_items = MockResearchProvider().collect(state)
    assert raw_items, "MockResearchProvider 未返回 RawResearchItem"
    for item in raw_items:
        RawResearchItem.model_validate(item.model_dump())

    dumped_items = [item.model_dump() for item in raw_items]
    platforms = {item.get("platform") for item in dumped_items}
    dimensions = {item.get("dimension") or item.get("related_dimension") for item in dumped_items}
    source_types = {item.get("source_type") for item in dumped_items}
    content = "\n".join(item.get("raw_content", "") for item in dumped_items)

    assert EXPECTED_COMPETITORS.issubset(platforms)
    assert EXPECTED_DIMENSIONS.issubset(dimensions)
    assert {"official", "review", "ecommerce", "user_review"}.issubset(source_types)
    assert source_types & {"news", "report"}
    assert "G Pro X Superlight 2" in content
    assert "Viper V3 Pro" in content
    assert "M75 Air" in content
    assert all(item.get("crawl_method") == "llm_mock" for item in dumped_items)
    assert all(str(item.get("source_url", "")).startswith("mock://gaming_mouse/") for item in dumped_items)

    print("Gaming mouse config 测试通过")
