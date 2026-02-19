---
name: fastapi
description: |
  FastAPI is a modern, high-performance Python web framework for building APIs.
  It leverages Python type hints and Pydantic for automatic validation, serialization,
  and OpenAPI documentation generation with async/await support out of the box.
license: Apache-2.0
compatibility:
  - python >= 3.8
  - pip
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frameworks
  tags:
    - python
    - api
    - async
    - rest
    - openapi
    - pydantic
---

# FastAPI

FastAPI is a Python web framework built on Starlette (ASGI) and Pydantic. It provides automatic request validation, serialization, and interactive API docs at `/docs` (Swagger UI) and `/redoc`.

## Installation

```bash
# Install FastAPI with uvicorn ASGI server
pip install "fastapi[standard]"
```

## Project Structure

```
# Typical FastAPI project layout
app/
├── main.py           # Application entry point
├── config.py         # Settings and configuration
├── models/           # SQLAlchemy / DB models
├── schemas/          # Pydantic schemas
├── routers/          # API route modules
├── dependencies.py   # Shared dependencies
├── middleware.py     # Custom middleware
└── tests/
```

## Application Setup

```python
# main.py — FastAPI application entry point
from fastapi import FastAPI
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize DB pool, caches, etc.
    yield
    # Shutdown: close connections

app = FastAPI(
    title="My API",
    version="1.0.0",
    lifespan=lifespan,
)
```

## Routes and Path Operations

```python
# routers/items.py — CRUD router for items
from fastapi import APIRouter, HTTPException, status, Query, Path
from pydantic import BaseModel, Field

router = APIRouter(prefix="/items", tags=["items"])

class ItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    price: float = Field(..., gt=0)
    description: str | None = None

class ItemResponse(ItemCreate):
    id: int

    model_config = {"from_attributes": True}

@router.get("/", response_model=list[ItemResponse])
async def list_items(skip: int = Query(0, ge=0), limit: int = Query(20, le=100)):
    return await db.fetch_items(skip=skip, limit=limit)

@router.post("/", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
async def create_item(item: ItemCreate):
    return await db.create_item(item)

@router.get("/{item_id}", response_model=ItemResponse)
async def get_item(item_id: int = Path(..., gt=0)):
    item = await db.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item
```

## Dependency Injection

```python
# dependencies.py — reusable dependencies
from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

async def get_db() -> AsyncSession:
    async with async_session() as session:
        yield session

async def get_current_user(authorization: str = Header(...)):
    token = authorization.removeprefix("Bearer ")
    user = await verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user

# Use in routes
@router.get("/me")
async def read_me(user=Depends(get_current_user), db=Depends(get_db)):
    return user
```

## Pydantic Schemas and Validation

```python
# schemas/user.py — request/response schemas with validation
from pydantic import BaseModel, EmailStr, field_validator
from datetime import datetime

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    username: str

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        if not v.isalnum():
            raise ValueError("must be alphanumeric")
        return v

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    username: str
    created_at: datetime

    model_config = {"from_attributes": True}
```

## Middleware

```python
# middleware.py — custom middleware example
import time
from fastapi import Request

@app.middleware("http")
async def add_timing_header(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start
    response.headers["X-Process-Time"] = f"{elapsed:.4f}"
    return response
```

## Background Tasks

```python
# routers/notifications.py — background task example
from fastapi import BackgroundTasks

async def send_email(to: str, body: str):
    # Long-running email sending logic
    ...

@router.post("/notify")
async def notify(email: str, bg: BackgroundTasks):
    bg.add_task(send_email, email, "Welcome!")
    return {"status": "queued"}
```

## WebSocket Support

```python
# routers/ws.py — WebSocket endpoint
from fastapi import WebSocket, WebSocketDisconnect

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Echo: {data}")
    except WebSocketDisconnect:
        pass
```

## Testing

```python
# tests/test_items.py — testing with httpx
from httpx import AsyncClient, ASGITransport
import pytest

@pytest.mark.anyio
async def test_create_item():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/items/", json={"name": "Widget", "price": 9.99})
        assert resp.status_code == 201
        assert resp.json()["name"] == "Widget"
```

## Running

```bash
# Run development server with auto-reload
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Key Patterns

- Use `response_model` to control output serialization and strip internal fields
- Group routes with `APIRouter` and include in main app via `app.include_router(router)`
- Use `Depends()` for DB sessions, auth, pagination — they compose and cache per-request
- Raise `HTTPException` for error responses; use custom exception handlers for global patterns
- Use `lifespan` context manager for startup/shutdown instead of deprecated events
- Set `from_attributes = True` in Pydantic config to read from ORM objects
