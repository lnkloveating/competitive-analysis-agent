"""爬虫数据库 ORM 模型。

复用认证模块的 SQLAlchemy Base / engine（auth/db.py），
所以 crawl_tasks / crawl_raw_items 与 users 表共存于同一个库
（默认 backend/auth/auth.db，可经 AUTH_DB_URL / MYSQL_* 切换）。
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from auth.db import Base


class CrawlTask(Base):
    """一次采集任务（实时爬取 / 批量导入 / 手动录入 / 预载灌库）。"""

    __tablename__ = "crawl_tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(String(128), unique=True, index=True, nullable=False)
    industry_key = Column(String(64), default="")
    description = Column(String(255), default="")
    status = Column(String(32), default="running")  # running / finished
    total_count = Column(Integer, default=0)
    success_count = Column(Integer, default=0)
    fail_count = Column(Integer, default=0)
    success_rate = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)

    items = relationship(
        "CrawlRawItem",
        back_populates="task",
        cascade="all, delete-orphan",
    )


class CrawlRawItem(Base):
    """单条采集到的原始研究条目，字段对齐 RawResearchItem。"""

    __tablename__ = "crawl_raw_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_pk = Column(Integer, ForeignKey("crawl_tasks.id"), index=True)

    item_id = Column(String(64), default="")
    platform = Column(String(128), default="")
    source_type = Column(String(32), default="review")
    source_title = Column(String(512), default="")
    source_url = Column(String(1024), default="")
    publish_time = Column(String(64), nullable=True)
    collected_time = Column(String(64), default="")
    raw_content = Column(Text, default="")
    crawl_method = Column(String(32), default="database")
    dimension = Column(String(128), default="")
    related_dimension = Column(String(128), default="")
    product_name = Column(String(256), default="")
    category = Column(String(128), default="", index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    task = relationship("CrawlTask", back_populates="items")
