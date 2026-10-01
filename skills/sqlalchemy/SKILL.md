---
name: sqlalchemy
description: >-
  SQLAlchemy is the Python SQL toolkit and ORM: tables are declared as typed
  Python classes and queried with select() statements on sync or asyncio
  engines. Use when a user asks to set up a Python ORM, define database models,
  write async database queries, fix MissingGreenlet or N+1 problems, manage
  migrations with Alembic, upgrade to SQLAlchemy 2.1, or choose between
  SQLAlchemy and Django ORM.
license: Apache-2.0
compatibility: 'SQLAlchemy 2.1 needs Python 3.11+ (2.0.x supports older Python); PostgreSQL, MySQL, SQLite'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  tags:
    - sqlalchemy
    - python
    - orm
    - database
    - async
  repository: https://github.com/sqlalchemy/sqlalchemy
---

# SQLAlchemy

## Overview

SQLAlchemy is the standard Python ORM and SQL toolkit. The 2.x API is type-friendly and has first-class asyncio support: define models as Python classes with `Mapped[...]` annotations, write queries with `select()`, and manage schema changes with Alembic migrations.

The current release line is **2.1** (2.1.1, September 2026); 2.0.x (last seen: 2.0.54) is the line for Python older than 3.11. What 2.1 changes for existing 2.0 code:

- Python 3.11 is the minimum.
- `greenlet` is no longer installed by default. Async code needs `pip install "sqlalchemy[asyncio]"`, otherwise importing `sqlalchemy.ext.asyncio` raises `ImportError`.
- A URL without a driver, `postgresql://...`, now selects psycopg 3 instead of psycopg2. Write `postgresql+psycopg2://` to keep the old driver. Oracle likewise defaults to python-oracledb.
- `select(a, b)` is typed `Select[int, str]` instead of `Select[Tuple[int, str]]` (needs mypy 1.7+).
- The session autoflushes before every statement, including `text()` and Core statements.

## Instructions

### Step 1: Async Setup

```bash
pip install "sqlalchemy[asyncio]" asyncpg alembic   # asyncpg: PostgreSQL; aiosqlite: SQLite; asyncmy: MySQL
```

```python
# db.py — Async SQLAlchemy configuration
import os

from sqlalchemy.ext.asyncio import AsyncAttrs, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

# postgresql+asyncpg://tracker:PASSWORD@db.internal:5432/tracker (URL-encode special characters in the password)
DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_async_engine(DATABASE_URL, echo=False, pool_size=20, pool_pre_ping=True)
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)

class Base(AsyncAttrs, DeclarativeBase):
    pass
```

### Step 2: Define Models

```python
# models.py — SQLAlchemy 2.x models with type hints
from db import Base
from sqlalchemy import String, ForeignKey, DateTime, Integer, Text, func
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
    description: Mapped[str | None] = mapped_column(Text)   # Optional type -> nullable column
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
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models import Project, Task

async def get_user_projects(db: AsyncSession, user_id: str):
    """Fetch a user's active projects with their tasks."""
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
    """Case-insensitive substring match on task titles."""
    result = await db.execute(
        select(Task)
        .where(
            Task.project_id == project_id,
            Task.title.icontains(query, autoescape=True),   # escapes % and _ typed by the user
        )
        .limit(20)
    )
    return result.scalars().all()
```

Writes go through a session and one explicit transaction:

```python
import uuid
from db import async_session_maker
from models import Task

async with async_session_maker() as session:   # inside a coroutine; project_id is an existing project's id
    async with session.begin():        # commits on success, rolls back on an exception
        session.add(Task(id=str(uuid.uuid4()), title="Add Stripe webhooks", project_id=project_id))
```

### Step 4: Alembic Migrations

```bash
# Initialize Alembic; the async template runs migrations through an async engine
alembic init -t async alembic          # sync drivers: alembic init alembic

# Generate migration from model changes
alembic revision --autogenerate -m "add tasks table"

# Apply migrations
alembic upgrade head

# Rollback one step
alembic downgrade -1
```

Autogenerate compares the database with `target_metadata`, which is `None` in a fresh `alembic/env.py`. Replace that line:

```python
# alembic/env.py
import os

import models  # noqa: F401  (importing the module registers its tables on Base.metadata)
from db import Base

config.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"].replace("%", "%%"))
target_metadata = Base.metadata
```

## Examples

### Example 1: Async models and the first migration for a project tracker

**User request:** "Set up SQLAlchemy with asyncpg and Alembic for our project tracker; the Postgres URL is in DATABASE_URL."

```bash
pip install "sqlalchemy[asyncio]" asyncpg alembic
alembic init -t async alembic        # then edit alembic/env.py as in Step 4
alembic revision --autogenerate -m "create users projects tasks"
alembic upgrade head
alembic check
```

```text
INFO  [alembic.autogenerate.compare.tables] Detected added table 'users'
INFO  [alembic.autogenerate.compare.constraints] Detected added index 'ix_users_email' on '('email',)'
INFO  [alembic.autogenerate.compare.tables] Detected added table 'projects'
INFO  [alembic.autogenerate.compare.tables] Detected added table 'tasks'
INFO  [alembic.runtime.migration] Running upgrade  -> 6d744e39acb8, create users projects tasks
No new upgrade operations detected.
```

After inserting one project with three tasks, `await get_project_stats(session, project.id)` returns `{'done': 1, 'todo': 2}` and `await search_tasks(session, "invoice", project.id)` returns the two tasks whose titles contain "invoice".

### Example 2: Fix MissingGreenlet on a relationship

**User request:** "My FastAPI endpoint crashes with MissingGreenlet when it reads project.tasks."

```text
sqlalchemy.exc.MissingGreenlet: greenlet_spawn has not been called; can't call await_() here.
Was IO attempted in an unexpected place?
```

The attribute was not loaded, and a lazy load is blocking I/O that an async session cannot do implicitly. Load it in the query, or await it explicitly:

```python
# 1. load with the parent (one extra SELECT ... WHERE project_id IN (...))
project = (
    await session.execute(
        select(Project).where(Project.id == project_id).options(selectinload(Project.tasks))
    )
).scalar_one()
print(len(project.tasks))

# 2. or load on demand; needs AsyncAttrs on the Base class (db.py above)
tasks = await project.awaitable_attrs.tasks
```

**Result:** both load the tasks without the error (the first prints the count). Add `lazy="raise"` to a `relationship()` to turn any forgotten eager load into an immediate, readable `InvalidRequestError` during development.

## Guidelines

- Use `Mapped` type hints (SQLAlchemy 2.x) — they provide IDE autocompletion and type safety.
- Always use `selectinload` or `joinedload` for relationships — prevents N+1 query problems. Prefer `selectinload` for collections and `joinedload` for many-to-one.
- Use `expire_on_commit=False` for async sessions — otherwise attributes expire at commit and the next access triggers a lazy load, which fails with `MissingGreenlet`.
- One `AsyncSession` per request or task; a session is not safe to share between concurrent tasks. Call `await engine.dispose()` at shutdown.
- Never build SQL with f-strings. Use `select()` expressions, or `text("... WHERE id = :id")` with bound parameters.
- Alembic autogenerate detects most schema changes, but not table or column renames (it emits drop plus add), and it compares server defaults only with `compare_server_default=True`; review each migration before applying, and run `alembic check` in CI.
- Keep the database URL and password in the environment, not in `alembic.ini` or source files.
- Upgrading from 2.0 to 2.1: move to Python 3.11+, add the `[asyncio]` extra, and name the PostgreSQL driver explicitly in the URL.
- For simple projects, consider SQLModel (FastAPI creator's library) — simpler API, same engine. SQLModel 0.0.47 pins `SQLAlchemy<2.1.0`, so it stays on 2.0.x for now.
- Inside a Django project use the Django ORM: the admin, forms and migrations depend on it. Choose SQLAlchemy for FastAPI, Flask or standalone services, for complex SQL, and when the schema is not owned by one framework.
