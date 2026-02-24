---
name: fastapi-advanced
description: >-
  Build production APIs with FastAPI advanced patterns. Use when a user asks
  to implement dependency injection, background tasks, WebSockets, middleware,
  database sessions, or structured error handling in FastAPI.
license: Apache-2.0
compatibility: 'Python 3.10+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - fastapi
    - python
    - api
    - async
    - production
---

# FastAPI (Advanced)

## Overview

Beyond basic CRUD, FastAPI supports dependency injection for clean architecture, background tasks, WebSocket endpoints, custom middleware, structured error handling, and database session management. This skill covers production patterns.

## Instructions

### Step 1: Dependency Injection

```python
# dependencies.py — Reusable dependencies
from fastapi import Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Annotated

from db import async_session_maker
from models import User
from auth import decode_jwt

async def get_db() -> AsyncSession:
    """Database session per request — auto-closes after response."""
    async with async_session_maker() as session:
        yield session

async def get_current_user(
    authorization: Annotated[str, Header()],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Extract and validate user from JWT token."""
    token = authorization.replace("Bearer ", "")
    payload = decode_jwt(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await db.get(User, payload["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def require_admin(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Chain dependency — requires authenticated admin."""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# Type aliases for cleaner signatures
DB = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(require_admin)]
```

### Step 2: Structured Routes

```python
# routes/projects.py — Clean route handlers
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from datetime import datetime

from dependencies import DB, CurrentUser

router = APIRouter(prefix="/projects", tags=["Projects"])

class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)

class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str | None
    status: str
    task_count: int
    created_at: datetime

    model_config = {"from_attributes": True}

@router.get("/", response_model=list[ProjectResponse])
async def list_projects(db: DB, user: CurrentUser, status: str = "active"):
    """List projects owned by the current user."""
    result = await db.execute(
        select(Project)
        .where(Project.owner_id == user.id, Project.status == status)
        .order_by(Project.created_at.desc())
    )
    return result.scalars().all()

@router.post("/", response_model=ProjectResponse, status_code=201)
async def create_project(
    data: ProjectCreate,
    db: DB,
    user: CurrentUser,
    background_tasks: BackgroundTasks,
):
    """Create a new project and notify team members."""
    project = Project(name=data.name, description=data.description, owner_id=user.id)
    db.add(project)
    await db.commit()
    await db.refresh(project)

    # Run notification in background (doesn't block response)
    background_tasks.add_task(notify_team, user.id, project.id)

    return project
```

### Step 3: Error Handling

```python
# errors.py — Structured error handling
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

class AppError(Exception):
    def __init__(self, message: str, code: str, status_code: int = 400):
        self.message = message
        self.code = code
        self.status_code = status_code

class NotFoundError(AppError):
    def __init__(self, resource: str, id: str):
        super().__init__(
            message=f"{resource} not found",
            code="NOT_FOUND",
            status_code=404,
        )

class ForbiddenError(AppError):
    def __init__(self, message: str = "Insufficient permissions"):
        super().__init__(message=message, code="FORBIDDEN", status_code=403)

def register_error_handlers(app: FastAPI):
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.message, "code": exc.code},
        )

    @app.exception_handler(Exception)
    async def generic_error_handler(request: Request, exc: Exception):
        # Log the real error, return generic message
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error", "code": "INTERNAL"},
        )
```

### Step 4: Middleware

```python
# middleware.py — Request logging and timing
import time
from fastapi import Request

@app.middleware("http")
async def timing_middleware(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000

    response.headers["X-Response-Time"] = f"{duration_ms:.0f}ms"

    # Log slow requests
    if duration_ms > 1000:
        print(f"SLOW REQUEST: {request.method} {request.url.path} took {duration_ms:.0f}ms")

    return response
```

## Guidelines

- Use dependency injection (`Depends`) for database sessions, auth, and shared logic.
- Type aliases (`CurrentUser = Annotated[User, Depends(...)]`) keep route signatures clean.
- Background tasks are for fire-and-forget work (emails, notifications). For reliable jobs, use Celery.
- Pydantic models with `from_attributes = True` serialize SQLAlchemy objects directly.
- Use `async def` for I/O-bound handlers, `def` for CPU-bound (FastAPI runs sync in threadpool).
