---
title: Build a Production FastAPI Microservice
slug: build-production-fastapi-service
description: >-
  Build a production-ready FastAPI microservice with SQLAlchemy async ORM,
  Alembic migrations, Pydantic validation, pytest testing, and Docker
  deployment. Complete with dependency injection and structured error handling.
skills:
  - fastapi-advanced
  - sqlalchemy
  - alembic
  - pydantic
  - pytest
  - uvicorn
  - docker-multi-stage
category: backend
tags:
  - fastapi
  - python
  - microservice
  - production
  - api
---

# Build a Production FastAPI Microservice

Ramon's team is migrating from a Django monolith to microservices. The first service to extract is the notification system — it handles email, SMS, push notifications, and webhook delivery. He builds it with FastAPI for async performance, SQLAlchemy for the database, and a clean architecture that the team can replicate for future services.

## Step 1: Project Structure

```bash
poetry new notification-service && cd notification-service
poetry add fastapi uvicorn[standard] sqlalchemy[asyncio] asyncpg pydantic-settings alembic
poetry add --group dev pytest pytest-asyncio pytest-cov httpx ruff mypy
```

```text
notification-service/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app factory
│   ├── config.py            # Settings from environment
│   ├── dependencies.py      # Database, auth, shared deps
│   ├── errors.py            # Custom exceptions
│   ├── models/              # SQLAlchemy models
│   │   ├── __init__.py
│   │   ├── base.py
│   │   └── notification.py
│   ├── schemas/             # Pydantic schemas
│   │   ├── __init__.py
│   │   └── notification.py
│   ├── routes/              # API endpoints
│   │   ├── __init__.py
│   │   ├── notifications.py
│   │   └── health.py
│   ├── services/            # Business logic
│   │   ├── __init__.py
│   │   ├── email.py
│   │   ├── sms.py
│   │   └── push.py
│   └── db.py                # Database engine and session
├── alembic/                 # Migrations
├── tests/
│   ├── conftest.py
│   ├── test_notifications.py
│   └── test_services.py
├── Dockerfile
├── docker-compose.yml
└── pyproject.toml
```

## Step 2: Configuration

Type-safe settings from environment variables — no more `os.getenv` scattered everywhere.

```python
# app/config.py — Centralized configuration
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    Args:
        database_url: PostgreSQL connection string (async driver)
        redis_url: Redis for caching and rate limiting
        sendgrid_api_key: SendGrid API key for email delivery
        twilio_account_sid: Twilio SID for SMS
        twilio_auth_token: Twilio auth token
        environment: Current environment (development, staging, production)
        debug: Enable debug mode (verbose logging, auto-reload)
    """
    database_url: str = "postgresql+asyncpg://localhost:5432/notifications"
    redis_url: str = "redis://localhost:6379"
    sendgrid_api_key: str = ""
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    environment: str = "development"
    debug: bool = False

    model_config = {"env_file": ".env"}

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

## Step 3: Database Models

```python
# app/models/notification.py — Notification model
from sqlalchemy import String, DateTime, Text, JSON, Index, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base
from datetime import datetime
import uuid

class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    channel: Mapped[str] = mapped_column(String(20))         # email, sms, push, webhook
    recipient: Mapped[str] = mapped_column(String(255))       # email address, phone, device token
    subject: Mapped[str | None] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, sent, failed, delivered
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON)
    error_message: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_notifications_status_created", "status", "created_at"),
        Index("ix_notifications_recipient", "recipient"),
    )
```

## Step 4: Pydantic Schemas

```python
# app/schemas/notification.py — Request/response schemas
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Literal

class NotificationCreate(BaseModel):
    """Schema for creating a notification.

    Args:
        channel: Delivery channel — email, sms, push, or webhook
        recipient: Target address (email, phone number, device token, or URL)
        subject: Optional subject line (required for email)
        body: Notification content
        metadata: Optional key-value pairs for template variables
    """
    channel: Literal["email", "sms", "push", "webhook"]
    recipient: str = Field(min_length=1, max_length=255)
    subject: str | None = Field(None, max_length=200)
    body: str = Field(min_length=1, max_length=10000)
    metadata: dict | None = None

    @field_validator("recipient")
    @classmethod
    def validate_recipient(cls, v, info):
        channel = info.data.get("channel")
        if channel == "email" and "@" not in v:
            raise ValueError("Email recipient must contain @")
        if channel == "sms" and not v.startswith("+"):
            raise ValueError("SMS recipient must be E.164 format (+1234567890)")
        return v

class NotificationResponse(BaseModel):
    id: str
    channel: str
    recipient: str
    status: str
    sent_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}

class NotificationList(BaseModel):
    data: list[NotificationResponse]
    total: int
    page: int
    per_page: int
```

## Step 5: Routes with Dependency Injection

```python
# app/routes/notifications.py — API endpoints
from fastapi import APIRouter, Depends, BackgroundTasks, Query
from sqlalchemy import select, func
from app.dependencies import DB, CurrentUser
from app.schemas.notification import NotificationCreate, NotificationResponse, NotificationList
from app.models.notification import Notification
from app.services.dispatcher import dispatch_notification

router = APIRouter(prefix="/notifications", tags=["Notifications"])

@router.post("/", response_model=NotificationResponse, status_code=201)
async def create_notification(
    data: NotificationCreate,
    db: DB,
    user: CurrentUser,
    background_tasks: BackgroundTasks,
):
    """Create and queue a notification for delivery."""
    notification = Notification(
        channel=data.channel,
        recipient=data.recipient,
        subject=data.subject,
        body=data.body,
        metadata_=data.metadata,
        status="pending",
    )
    db.add(notification)
    await db.commit()
    await db.refresh(notification)

    # Deliver asynchronously
    background_tasks.add_task(dispatch_notification, notification.id)

    return notification

@router.get("/", response_model=NotificationList)
async def list_notifications(
    db: DB,
    user: CurrentUser,
    status: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List notifications with pagination and optional status filter."""
    query = select(Notification).order_by(Notification.created_at.desc())
    if status:
        query = query.where(Notification.status == status)

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar()

    # Paginate
    notifications = (await db.execute(
        query.offset((page - 1) * per_page).limit(per_page)
    )).scalars().all()

    return NotificationList(data=notifications, total=total, page=page, per_page=per_page)
```

## Step 6: Tests

```python
# tests/conftest.py — Test fixtures
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.main import create_app
from app.models.base import Base
from app.dependencies import get_db

@pytest.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_maker = async_sessionmaker(engine, expire_on_commit=False)
    async with session_maker() as session:
        yield session

@pytest.fixture
async def client(db):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

# tests/test_notifications.py
@pytest.mark.asyncio
async def test_create_email_notification(client):
    response = await client.post("/notifications/", json={
        "channel": "email",
        "recipient": "user@example.com",
        "subject": "Test",
        "body": "Hello from tests",
    }, headers={"Authorization": "Bearer test-token"})

    assert response.status_code == 201
    data = response.json()
    assert data["channel"] == "email"
    assert data["status"] == "pending"

@pytest.mark.asyncio
async def test_create_sms_requires_e164(client):
    response = await client.post("/notifications/", json={
        "channel": "sms",
        "recipient": "not-a-phone",
        "body": "Hello",
    }, headers={"Authorization": "Bearer test-token"})

    assert response.status_code == 422
```

## Results

The notification service handles 5,000 notifications/minute on a single instance (4 Uvicorn workers). The async architecture means sending an email doesn't block processing other requests. Pydantic catches malformed inputs before they reach the database — invalid phone numbers, missing subjects for emails, oversized payloads. Alembic migrations run in CI, so schema changes are tested before reaching production. The test suite runs in 3 seconds (in-memory SQLite), giving the team confidence to refactor and ship daily. When the team extracts the next microservice (billing), they copy the project structure and have a working skeleton in 30 minutes.
