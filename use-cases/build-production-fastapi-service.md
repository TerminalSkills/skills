---
title: Build a Production FastAPI Microservice
slug: build-production-fastapi-service
description: >-
  Build a production-ready FastAPI microservice with SQLAlchemy async ORM,
  Alembic migrations, Pydantic validation, pytest testing, and Docker
  deployment. Complete with dependency injection and structured error handling.
skills:
  - fastapi
  - sqlalchemy
  - alembic
  - pydantic
  - pytest
  - uvicorn
  - docker-helper
category: development
tags:
  - fastapi
  - python
  - microservice
  - production
  - api
---

# Build a Production FastAPI Microservice

Ramon's team is migrating from a Django monolith to microservices. The first service to extract is the notification system, which handles email, SMS, push and webhook delivery. He builds it with FastAPI for async I/O, SQLAlchemy for the database, and a layout the team can copy for the next service.

## Step 1: Project and Configuration

```bash
uv init --bare --python 3.12 --name notification-service && cd notification-service
uv add "fastapi[standard]" "sqlalchemy[asyncio]" asyncpg pydantic-settings alembic
uv add --dev pytest pytest-asyncio aiosqlite ruff
mkdir -p app/models app/schemas app/routes app/services tests
uv run alembic init -t async migrations
printf '[tool.pytest.ini_options]\nasyncio_mode = "auto"\nasyncio_default_fixture_loop_scope = "function"\npythonpath = ["."]\n' >> pyproject.toml
```

`fastapi[standard]` brings Uvicorn, the `fastapi` CLI and `httpx`; `aiosqlite` is for tests only. The last line lets pytest find the `app` package, run async tests without markers, and sets the fixture loop scope explicitly (pytest-asyncio warns when it is unset).

Settings come from the environment (`pydantic-settings`); secrets are `SecretStr`, so they never appear in a repr or log line.

```python
# app/config.py
from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")
    database_url: str = "postgresql+asyncpg://notifications:change-me@localhost:5432/notifications"
    api_token: SecretStr = SecretStr("")  # bearer token callers must send

get_settings = lru_cache(Settings)
```

## Step 2: Database Model

```python
# app/models/notification.py
import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    pass

class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    channel: Mapped[str] = mapped_column(String(20))  # email, sms, push, webhook
    recipient: Mapped[str] = mapped_column(String(255), index=True)
    subject: Mapped[str | None] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending, sent, failed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

## Step 3: Pydantic Schemas

Pydantic validates the request body before the route runs. A `model_validator` sees every field at once, so cross-field rules (an email needs a subject, an SMS number must be E.164) live in one place.

```python
# app/schemas/notification.py
from typing import Literal

from pydantic import BaseModel, Field, model_validator

class NotificationCreate(BaseModel):
    channel: Literal["email", "sms", "push", "webhook"]
    recipient: str = Field(min_length=1, max_length=255)
    subject: str | None = Field(None, max_length=200)
    body: str = Field(min_length=1, max_length=10000)

    @model_validator(mode="after")
    def check_channel_rules(self):
        if self.channel == "email" and ("@" not in self.recipient or not self.subject):
            raise ValueError("Email needs an address with @ and a subject")
        if self.channel == "sms" and not self.recipient.startswith("+"):
            raise ValueError("SMS recipient must be E.164 format (+1234567890)")
        return self
```

## Step 4: Dependencies and Delivery

One engine per process; routes ask for the session factory, which tests override. The bearer token is compared in constant time (as bytes, because `compare_digest` raises on non-ASCII `str`), and the service rejects every request while `API_TOKEN` is unset.

```python
# app/dependencies.py
import hmac
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings

engine = create_async_engine(get_settings().database_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return SessionLocal

Sessions = Annotated[async_sessionmaker[AsyncSession], Depends(get_sessionmaker)]

def require_token(creds: Annotated[HTTPAuthorizationCredentials, Depends(HTTPBearer())]) -> None:
    expected = get_settings().api_token.get_secret_value()
    if not expected or not hmac.compare_digest(creds.credentials.encode(), expected.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid bearer token")
```

The background task opens its own session, because the request's session is closed once the response is sent. It skips rows that are no longer `pending`, so a retry cannot deliver twice.

```python
# app/services/dispatcher.py
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.notification import Notification

async def dispatch_notification(sessions: async_sessionmaker[AsyncSession], notification_id: str) -> None:
    async with sessions() as db:
        notification = await db.get(Notification, notification_id)
        if notification is None or notification.status != "pending":
            return  # already handled: makes a retry safe
        try:
            if notification.channel == "webhook":  # caller-supplied URLs need a host allow-list (SSRF)
                raise NotImplementedError
            ...  # call SendGrid, Twilio or the push provider for notification.channel here
            notification.status = "sent"
        except Exception:
            notification.status = "failed"
        await db.commit()
```

## Step 5: Routes

```python
# app/routes/notifications.py
from fastapi import APIRouter, BackgroundTasks, Depends

from app.dependencies import Sessions, require_token
from app.models.notification import Notification
from app.schemas.notification import NotificationCreate
from app.services.dispatcher import dispatch_notification

router = APIRouter(prefix="/notifications", tags=["Notifications"])

@router.post("/", status_code=202, dependencies=[Depends(require_token)])  # accepted: delivery happens after the response
async def create_notification(data: NotificationCreate, sessions: Sessions, background_tasks: BackgroundTasks):
    notification = Notification(**data.model_dump())
    async with sessions() as db:
        db.add(notification)
        await db.commit()
    background_tasks.add_task(dispatch_notification, sessions, notification.id)
    return {"id": notification.id, "status": "pending"}
```

`app/main.py` is a small factory: `create_app()` builds `FastAPI(title="Notification Service")`, includes `notifications.router` and returns it; `app = create_app()` is what Uvicorn serves.

## Step 6: Migrations

In `migrations/env.py` (generated above), import the metadata and point Alembic at the same URL the app uses (the generated `alembic.ini` already has `prepend_sys_path = .`, which lets `env.py` import `app`):

```python
from app.config import get_settings
from app.models.notification import Base

target_metadata = Base.metadata
config.set_main_option("sqlalchemy.url", get_settings().database_url.replace("%", "%%"))
```

```bash
export DATABASE_URL="postgresql+asyncpg://notifications:$POSTGRES_PASSWORD@127.0.0.1:5432/notifications"
uv run alembic revision --autogenerate -m "create notifications"   # review the file it writes
uv run alembic upgrade head
```

## Step 7: Tests

```python
# tests/conftest.py
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import get_settings
from app.dependencies import get_sessionmaker
from app.main import create_app
from app.models.notification import Base

@pytest_asyncio.fixture
async def client(monkeypatch, tmp_path):
    monkeypatch.setenv("API_TOKEN", "test-token")
    get_settings.cache_clear()
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/test.db")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    app = create_app()
    app.dependency_overrides[get_sessionmaker] = lambda: sessions
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        ac.headers["Authorization"] = "Bearer test-token"
        ac.sessions = sessions
        yield ac
```

```python
# tests/test_notifications.py
from sqlalchemy import select

from app.models.notification import Notification

EMAIL = {"channel": "email", "recipient": "user@example.com", "subject": "Test", "body": "Hello"}

async def test_email_notification_is_created_and_delivered(client):
    response = await client.post("/notifications/", json=EMAIL)
    assert response.status_code == 202
    assert response.json()["status"] == "pending"
    # ASGITransport runs background tasks before returning, so the row is already "sent"
    async with client.sessions() as db:
        assert (await db.scalar(select(Notification.status))) == "sent"

async def test_email_needs_a_subject(client):
    payload = {"channel": "email", "recipient": "user@example.com", "body": "Hello"}
    assert (await client.post("/notifications/", json=payload)).status_code == 422

async def test_requires_bearer_token(client):
    response = await client.post("/notifications/", json=EMAIL, headers={"Authorization": "Bearer x"})
    assert response.status_code == 401
```

## Step 8: Docker

A multi-stage build keeps uv and the build cache out of the final image, the service runs as a non-root user, and `uv.lock` makes the install reproducible. Use a managed or separately run PostgreSQL for the data.

```dockerfile
FROM python:3.14-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:0.12.20 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.14-slim
WORKDIR /app
RUN useradd --system --uid 1001 app
COPY --from=builder /app/.venv /app/.venv
COPY . .
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
USER app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

Add a `.dockerignore` with `.venv`, `.git`, `.env`, `__pycache__` and `tests/`; `DATABASE_URL` and `API_TOKEN` go in an env file kept out of the repo and the image. Run migrations in a one-off container so the four workers never race to migrate, and publish the port on `127.0.0.1` only (a reverse proxy in front handles TLS):

```bash
docker build -t notification-service .
docker run --rm --env-file prod.env notification-service alembic upgrade head
docker run -d --name notifications --env-file prod.env -p 127.0.0.1:8000:8000 --restart unless-stopped notification-service
```

## Results

Ramon's team now has a service skeleton with separate layers: Pydantic rejects malformed input before it reaches the database, delivery runs after the response and is safe to retry, and the same Alembic migrations run locally, in CI and in the container. The tests run in under a second against SQLite. For the next service (billing) they copy this layout and the Dockerfile.

## Related Skills

- [fastapi](/skills/fastapi) — app factory, `Depends`, background tasks and async tests
- [sqlalchemy](/skills/sqlalchemy) — the async engine, sessions and the 2.x mapped model
- [alembic](/skills/alembic) — the async migration environment and autogenerate
- [pydantic](/skills/pydantic) — cross-field validation and settings
- [pytest](/skills/pytest) — async fixtures and `asyncio_mode`
- [uvicorn](/skills/uvicorn) — running the app with several workers
- [docker-helper](/skills/docker-helper) — the multi-stage Dockerfile and `.dockerignore`
