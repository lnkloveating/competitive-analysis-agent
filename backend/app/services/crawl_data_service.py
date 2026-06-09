"""爬虫数据库服务层。

封装 crawl_tasks / crawl_raw_items 的读写，给以下调用方使用：
- scripts/init_crawl_db.py           建表
- scripts/seed_crawl_db_from_json.py 把预载 JSON 灌入库
- crawler_package 的导入脚本          批量 / 手动入库
- DatabaseResearchProvider           工作流读取（按 category 查表）
- crawl_db_cli.py                    统计 / 列表
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from auth.db import Base, get_engine, session_scope
from app.schemas.research import RawResearchItem

# 触发模型注册到 Base.metadata
from app.models.crawl_models import CrawlTask, CrawlRawItem  # noqa: F401


# RawResearchItem 与 CrawlRawItem 共有的字段
ITEM_FIELDS = [
    "item_id",
    "platform",
    "source_type",
    "source_title",
    "source_url",
    "publish_time",
    "collected_time",
    "raw_content",
    "crawl_method",
    "dimension",
    "related_dimension",
    "product_name",
    "category",
]


class CrawlDataService:
    @staticmethod
    def ensure_tables() -> None:
        """确保 crawl_tasks / crawl_raw_items 已创建（幂等）。"""
        Base.metadata.create_all(bind=get_engine())

    @staticmethod
    def create_task(task_id: str, industry_key: str, description: str = "") -> int:
        """新建任务行；若同名 task_id 已存在则清空其旧条目后复用（便于幂等重灌）。返回主键 id。"""
        CrawlDataService.ensure_tables()
        with session_scope() as session:
            task = session.query(CrawlTask).filter_by(task_id=task_id).first()
            if task is not None:
                # 清空旧条目，重置统计，避免重复导入累加
                session.query(CrawlRawItem).filter_by(task_pk=task.id).delete()
                task.industry_key = industry_key or task.industry_key
                task.description = description or task.description
                task.status = "running"
                task.total_count = 0
                task.success_count = 0
                task.fail_count = 0
                task.success_rate = 0.0
                task.finished_at = None
                session.flush()
                return task.id

            task = CrawlTask(
                task_id=task_id,
                industry_key=industry_key,
                description=description,
                status="running",
            )
            session.add(task)
            session.flush()
            return task.id

    @staticmethod
    def add_item(task_db_id: int, item: RawResearchItem | Dict[str, Any]) -> int:
        """写入一条采集条目。item 可为 RawResearchItem 或 dict。返回条目主键 id。"""
        CrawlDataService.ensure_tables()
        if isinstance(item, RawResearchItem):
            data = item.model_dump()
        else:
            data = dict(item)

        with session_scope() as session:
            row = CrawlRawItem(
                task_pk=task_db_id,
                **{field: data.get(field) for field in ITEM_FIELDS},
            )
            session.add(row)
            session.flush()
            return row.id

    @staticmethod
    def finish_task(task_id: str, total: int, success: int, fail: int) -> None:
        """收尾任务：写入总数/成功/失败/成功率，标记 finished。"""
        with session_scope() as session:
            task = session.query(CrawlTask).filter_by(task_id=task_id).first()
            if task is None:
                return
            task.total_count = int(total or 0)
            task.success_count = int(success or 0)
            task.fail_count = int(fail or 0)
            task.success_rate = round(success / total * 100, 1) if total else 0.0
            task.status = "finished"
            task.finished_at = datetime.utcnow()

    @staticmethod
    def list_all_tasks() -> List[Dict[str, Any]]:
        """列出全部任务（给 CLI / 统计用）。"""
        CrawlDataService.ensure_tables()
        with session_scope() as session:
            tasks = session.query(CrawlTask).order_by(CrawlTask.created_at.desc()).all()
            return [
                {
                    "task_id": t.task_id,
                    "industry_key": t.industry_key,
                    "description": t.description,
                    "status": t.status,
                    "total_count": t.total_count,
                    "success_count": t.success_count,
                    "fail_count": t.fail_count,
                    "success_rate": t.success_rate,
                }
                for t in tasks
            ]

    @staticmethod
    def load_items_by_category(category: str) -> List[RawResearchItem]:
        """按品类（电竞鼠标/电竞键盘/电竞头戴式耳机）查出全部条目，供工作流使用。"""
        CrawlDataService.ensure_tables()
        with session_scope() as session:
            rows = (
                session.query(CrawlRawItem)
                .filter(CrawlRawItem.category == category)
                .order_by(CrawlRawItem.item_id.asc())
                .all()
            )
            items: List[RawResearchItem] = []
            for row in rows:
                payload = {field: getattr(row, field) for field in ITEM_FIELDS}
                try:
                    items.append(RawResearchItem(**payload))
                except Exception:
                    # 单条脏数据不阻断整体读取
                    continue
            return items

    @staticmethod
    def count_items() -> int:
        CrawlDataService.ensure_tables()
        with session_scope() as session:
            return session.query(CrawlRawItem).count()

    @staticmethod
    def existing_urls() -> set[str]:
        """库内已有的 source_url 集合，供增量爬虫去重。"""
        CrawlDataService.ensure_tables()
        with session_scope() as session:
            rows = session.query(CrawlRawItem.source_url).all()
            return {url for (url,) in rows if url}
