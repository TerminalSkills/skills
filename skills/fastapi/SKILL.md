---
name: fastapi
description: >-
  FastAPI is a Python web framework for building HTTP and WebSocket APIs from type-annotated functions, with request validation by Pydantic and automatic OpenAPI docs at /docs. Use this skill to create a FastAPI project, define routes and Pydantic schemas, use Depends dependency injection and Annotated parameters, add auth headers, background tasks, middleware, lifespan startup, WebSockets, tests with TestClient or httpx, and run the app with the fastapi CLI.
license: Apache-2.0
compatibility: 'Python 3.10+ (fastapi 0.162 requires >=3.10), pip or uv'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/fastapi/fastapi
  tags:
    - python
    - api
    - async
    - openapi
    - pydantic
---

# FastAPI

## Overview

FastAPI is built on Starlette (ASGI) and Pydantic v2. Path operation functions declare their inputs with type hints (path, query, header, body); FastAPI validates them, returns 422 with details on bad input, serialises the return value through `response_model`, and serves interactive docs at `/docs` (Swagger UI) and `/redoc` plus the schema at `/openapi.json`. The code below was run with fastapi 0.162.0, Starlette 1.10, Pydantic 2.14 and pytest 9.

## Instructions

### 1. Install and layout

```bash
python -m venv .venv && source .venv/bin/activate
pip install "fastapi[standard]"      # adds the fastapi CLI, uvicorn, httpx, email-validator
```

```
shop-api/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI() app, lifespan, include_router
│   ├── deps.py          # shared dependencies
│   └── routers/
│       ├── __init__.py
│       ├── items.py
│       └── ws.py
├── tests/
│   └── test_items.py
└── conftest.py          # anyio_backend fixture
```

### 2. App and lifespan

Use `lifespan` for startup and shutdown work (`@app.on_event` is deprecated).

```python
# app/main.py
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .routers import items, ws


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.items = {}          # startup: open pools, load caches
    yield
    app.state.items.clear()       # shutdown: close connections


app = FastAPI(title="Shop API", version="1.0.0", lifespan=lifespan)
app.include_router(items.router)
app.include_router(ws.router)
```

### 3. Dependencies

Declare parameters and dependencies with `Annotated`; give reusable ones an alias. A `Header()` parameter named `x_api_key` reads the `X-API-Key` header (underscores become hyphens).

```python
# app/deps.py
import os
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request


def get_store(request: Request) -> dict[int, dict]:
    return request.app.state.items


Store = Annotated[dict[int, dict], Depends(get_store)]


async def current_user(x_api_key: Annotated[str, Header()]) -> str:
    # keys come from the environment, e.g. SHOP_API_KEYS="key-maria-7f3a:maria,key-dmitri-91bc:dmitri"
    keys = dict(pair.split(":") for pair in os.environ.get("SHOP_API_KEYS", "").split(",") if pair)
    user = keys.get(x_api_key)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return user


CurrentUser = Annotated[str, Depends(current_user)]
```

### 4. Routes, schemas, background tasks

```python
# app/routers/items.py
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, HTTPException, Path, Query, status
from pydantic import BaseModel, Field

from ..deps import CurrentUser, Store

router = APIRouter(prefix="/items", tags=["items"])


class ItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    price: float = Field(gt=0)
    description: str | None = None


class ItemResponse(ItemCreate):
    id: int


def audit(user: str, action: str) -> None:
    print(f"audit: {user} {action}")


@router.get("/", response_model=list[ItemResponse])
async def list_items(
    store: Store,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    return list(store.values())[skip : skip + limit]


@router.post("/", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
async def create_item(item: ItemCreate, store: Store, user: CurrentUser, tasks: BackgroundTasks):
    new_id = max(store, default=0) + 1
    store[new_id] = {"id": new_id, **item.model_dump()}
    tasks.add_task(audit, user, f"created item {new_id}")   # runs after the response is sent
    return store[new_id]


@router.get("/{item_id}", response_model=ItemResponse)
async def get_item(item_id: Annotated[int, Path(gt=0)], store: Store):
    if item_id not in store:
        raise HTTPException(status_code=404, detail="Item not found")
    return store[item_id]
```

For ORM objects add `model_config = {"from_attributes": True}` to the response schema. Validators use Pydantic v2 names: `field_validator` with `@classmethod`, and `EmailStr` needs `email-validator` (included in `fastapi[standard]`).

### 5. WebSocket and middleware

```python
# app/routers/ws.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


@router.websocket("/ws/{client_id}")
async def echo(websocket: WebSocket, client_id: str):
    await websocket.accept()
    try:
        while True:
            text = await websocket.receive_text()
            await websocket.send_text(f"{client_id}: {text}")
    except WebSocketDisconnect:
        pass
```

```python
# in app/main.py, after app = FastAPI(...)
import time
from fastapi import Request


@app.middleware("http")
async def add_timing_header(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Process-Time"] = f"{time.perf_counter() - start:.4f}"
    return response
```

### 6. Tests

`TestClient` as a context manager runs the lifespan; without the `with` block `app.state.items` would not exist. For async tests, `pytest.mark.anyio` needs an `anyio_backend` fixture, otherwise it also tries the `trio` backend.

```python
# conftest.py
import pytest


@pytest.fixture
def anyio_backend():
    return "asyncio"
```

```python
# tests/test_items.py
import pytest
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from app.main import app

HEADERS = {"X-API-Key": "key-maria-7f3a"}


def test_create_and_read_item(monkeypatch):
    monkeypatch.setenv("SHOP_API_KEYS", "key-maria-7f3a:maria")
    with TestClient(app) as client:
        r = client.post("/items/", json={"name": "Desk lamp", "price": 79.0}, headers=HEADERS)
        assert r.status_code == 201
        assert client.get(f"/items/{r.json()['id']}").json()["name"] == "Desk lamp"
        assert client.post("/items/", json={"name": "x", "price": 1}).status_code == 422
        with client.websocket_connect("/ws/maria") as ws:
            ws.send_text("hi")
            assert ws.receive_text() == "maria: hi"


@pytest.mark.anyio
async def test_async_client(monkeypatch):
    monkeypatch.setenv("SHOP_API_KEYS", "key-maria-7f3a:maria")
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.post("/items/", json={"name": "Notebook", "price": 4.5}, headers=HEADERS)
            assert r.status_code == 201
```

Run with `python -m pytest -q`.

### 7. Run

```bash
fastapi dev app/main.py --port 8000     # development: auto-reload, binds 127.0.0.1
fastapi run app/main.py --host 0.0.0.0 --port 8000 --workers 4   # production-style, no reload
```

`fastapi dev` listens on 127.0.0.1 only. Pass `--host 0.0.0.0` only inside a container or behind a firewall or proxy. `uvicorn app.main:app` also works.

## Examples

### Example 1: CRUD endpoint for products

Request: "Add a products API with create, list and get, validated, with 404 for unknown ids."

Copy the items router above with `ProductCreate`/`ProductResponse`, include it in `main.py`, and run `fastapi dev app/main.py`. Result: `POST /items/` with header `X-API-Key: key-maria-7f3a` returns 201 and `{"name":"Desk lamp","price":79.0,"description":null,"id":1}`; `GET /items/99` returns 404 `{"detail":"Item not found"}`; a negative price returns 422; `/docs` lists all three operations.

### Example 2: Protect routes with an API key dependency

Request: "Only users with a valid key may create items."

Use `CurrentUser` from `deps.py` on the write routes. Result: a missing header returns 422 (the required header is part of the schema), an unknown key returns 401 `Invalid API key`, a valid key goes through. For OAuth2 or JWT use `fastapi.security` (`OAuth2PasswordBearer`) and the official security tutorial.

## Guidelines

- Use `async def` only when the body awaits non-blocking I/O; plain `def` routes run in a thread pool. Blocking calls (requests, sync DB drivers) inside `async def` stall the whole event loop.
- Always set `response_model` (or a return type) so internal fields such as password hashes are not serialised.
- Keep secrets in environment variables or settings (`pydantic-settings`), not in code.
- Background tasks run in the same process and are lost on a crash; use a queue (Celery, ARQ, Dramatiq) for important work.
- Restrict CORS to known origins with `CORSMiddleware`; do not combine `allow_origins=["*"]` with credentials.
- Upgrade note: since 0.162 an omitted `bool` form field no longer defaults to `False` (declare `= False` explicitly for HTML checkboxes), and since 0.160 a parameter model's `extra` setting applies to every submitted query/header/cookie/form field. Read the release notes before bumping.
- Do not rely on `/docs` in production if the API is private; set `docs_url=None` on `FastAPI(...)`.
