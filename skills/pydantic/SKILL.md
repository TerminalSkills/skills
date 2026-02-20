---
name: pydantic
description: >-
  Validate and serialize data with Pydantic. Use when a user asks to validate
  API inputs, parse JSON/env config, define data models in Python, serialize
  objects, or implement data validation with type hints.
license: Apache-2.0
compatibility: 'Python 3.10+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: backend
  tags:
    - pydantic
    - validation
    - python
    - data
    - serialization
---

# Pydantic

## Overview

Pydantic is a data validation library that uses Python type hints. Define a model class, and Pydantic validates inputs, coerces types, and serializes outputs automatically. Used by FastAPI, LangChain, and most modern Python frameworks.

## Instructions

### Step 1: Basic Models

```python
# schemas.py — Data models with validation
from pydantic import BaseModel, Field, EmailStr, field_validator
from datetime import datetime

class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    age: int = Field(ge=13, le=120)
    role: str = Field(default="member", pattern="^(admin|member|viewer)$")

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}    # works with ORM objects

# Usage
user = UserCreate(name="Alice", email="alice@example.com", age=28)
print(user.model_dump())            # {"name": "Alice", "email": "alice@example.com", ...}
print(user.model_dump_json())       # JSON string

# Validation error
try:
    UserCreate(name="A", email="not-an-email", age=5)
except ValidationError as e:
    print(e.errors())
    # [{"type": "string_too_short", "loc": ["name"], ...}, ...]
```

### Step 2: Custom Validators

```python
from pydantic import BaseModel, field_validator, model_validator

class ProjectCreate(BaseModel):
    name: str
    slug: str
    start_date: datetime
    end_date: datetime | None = None

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        if not v.replace("-", "").isalnum():
            raise ValueError("Slug must contain only letters, numbers, and hyphens")
        return v.lower()

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_date and self.end_date <= self.start_date:
            raise ValueError("End date must be after start date")
        return self
```

### Step 3: Settings from Environment

```python
# config.py — App configuration from env vars
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    redis_url: str = "redis://localhost:6379"
    secret_key: str
    debug: bool = False
    allowed_origins: list[str] = ["http://localhost:3000"]
    max_upload_mb: int = 10

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }

settings = Settings()   # auto-reads from .env and environment variables
```

### Step 4: Discriminated Unions

```python
# events.py — Polymorphic event types
from pydantic import BaseModel
from typing import Literal

class TaskCreated(BaseModel):
    type: Literal["task.created"] = "task.created"
    task_id: str
    project_id: str
    title: str

class TaskCompleted(BaseModel):
    type: Literal["task.completed"] = "task.completed"
    task_id: str
    completed_by: str
    duration_hours: float

class CommentAdded(BaseModel):
    type: Literal["comment.added"] = "comment.added"
    comment_id: str
    task_id: str
    body: str

# Discriminated union — Pydantic picks the right type based on "type" field
WebhookEvent = TaskCreated | TaskCompleted | CommentAdded

# Parse any event
event = WebhookEvent.model_validate({"type": "task.completed", "task_id": "123", ...})
# Returns TaskCompleted instance
```

## Guidelines

- Pydantic v2 is 5-50x faster than v1 — rewritten in Rust (pydantic-core).
- Use `Field(...)` for constraints: `min_length`, `max_length`, `ge`, `le`, `pattern`.
- `from_attributes = True` enables direct serialization of ORM objects (SQLAlchemy, Django).
- Use `pydantic-settings` for type-safe configuration from environment variables.
- Discriminated unions handle polymorphic data — Pydantic picks the right model based on a field value.
