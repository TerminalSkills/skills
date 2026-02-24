---
name: sqlalchemy
description: >-
  Work with databases in Python using SQLAlchemy. Use when a user asks to
  set up a Python ORM, define database models, write async database queries,
  manage migrations with Alembic, or choose between SQLAlchemy and Django ORM.
license: Apache-2.0
compatibility: 'Python 3.10+, PostgreSQL, MySQL, SQLite'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
    - sqlalchemy
    - python
    - orm
    - database
    - async
---

# SQLAlchemy

## Overview

SQLAlchemy is the standard Python ORM and SQL toolkit. Version 2.0 introduces a modern, type-friendly API with async support. Define models as Python classes, write queries with the builder pattern, and manage schema changes with Alembic migrations.

## Instructions

### Step 1: Async Setup

```python
# db.py — Async SQLAlchemy configuration
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import String, ForeignKey, DateTime, func
from datetime import datetime

DATABASE_URL = "postgresql+asyncpg://user:pass@localhost:5432/myapp"

engine = create_async_engine(DATABASE_URL, echo=False, pool_size=20)
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass
```

### Step 2: Define Models

```python
# models.py — SQLAlchemy 2.0 models with type hints
from db import Base
from sqlalchemy import String, ForeignKey, DateTime, Integer, Text, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    role: Mapped[str] = mapped_column(String(20), default="member")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    projects: Mapped[list["Project"]] = relationship(back_populates="owner", cascade="all, delete")

    def __repr__(self) -> str:
        return f"<User {self.email}>"

class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="active")
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    task_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    owner: Mapped["User"] = relationship(back_populates="projects")
    tasks: Mapped[list["Task"]] = relationship(back_populates="project", cascade="all, delete")

class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="todo")
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    assignee_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))

    project: Mapped["Project"] = relationship(back_populates="tasks")
```

### Step 3: Queries

```python
# queries.py — Async query examples
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload

async def get_user_projects(db: AsyncSession, user_id: str):
    """Fetch user's projects with task counts."""
    result = await db.execute(
        select(Project)
        .where(Project.owner_id == user_id, Project.status == "active")
        .options(selectinload(Project.tasks))   # eager load to avoid N+1
        .order_by(Project.created_at.desc())
    )
    return result.scalars().all()

async def get_project_stats(db: AsyncSession, project_id: str):
    """Aggregate task statistics for a project."""
    result = await db.execute(
        select(
            Task.status,
            func.count(Task.id).label("count"),
        )
        .where(Task.project_id == project_id)
        .group_by(Task.status)
    )
    return {row.status: row.count for row in result.all()}

async def search_tasks(db: AsyncSession, query: str, project_id: str):
    """Full-text search in task titles."""
    result = await db.execute(
        select(Task)
        .where(
            and_(
                Task.project_id == project_id,
                Task.title.ilike(f"%{query}%"),
            )
        )
        .limit(20)
    )
    return result.scalars().all()
```

### Step 4: Alembic Migrations

```bash
# Initialize Alembic
pip install alembic
alembic init alembic

# Generate migration from model changes
alembic revision --autogenerate -m "add tasks table"

# Apply migrations
alembic upgrade head

# Rollback one step
alembic downgrade -1
```

## Guidelines

- Use `Mapped` type hints (SQLAlchemy 2.0) — they provide IDE autocompletion and type safety.
- Always use `selectinload` or `joinedload` for relationships — prevents N+1 query problems.
- Use `expire_on_commit=False` for async sessions — prevents lazy loading exceptions.
- Alembic autogenerate detects most schema changes, but review migrations before applying.
- For simple projects, consider SQLModel (FastAPI creator's library) — simpler API, same engine.
