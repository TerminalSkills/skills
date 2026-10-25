---
name: pydantic
description: >-
  Pydantic validates and serializes Python data using type hints: define a model class and it parses, coerces and checks input, then dumps it back to dicts or JSON. Use when a user asks to validate API request bodies, parse JSON, load typed settings from environment variables, define data models, write custom validators, parse tagged unions of event types, or migrate code from Pydantic v1 to v2.
license: Apache-2.0
compatibility: 'Python 3.10+ for pydantic 2.14; pydantic-settings 2.16 needs Python 3.11+'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/pydantic/pydantic
  tags: "pydantic, validation, python, data, serialization"
---

# Pydantic

## Overview

Pydantic is a data validation library built on Python type hints. A model class validates inputs, coerces types (`"28"` becomes `28` in the default lax mode), and serializes outputs. The core is written in Rust (pydantic-core), and the library underlies FastAPI, LangChain and most modern Python frameworks. This skill targets Pydantic v2 (2.14.1 checked, October 2026) and `pydantic-settings` 2.16; every snippet below was run against those versions.

## Instructions

### Step 1: Install

```bash
pip install pydantic                  # core
pip install "pydantic[email]"         # adds email-validator, required by EmailStr
pip install pydantic-settings         # BaseSettings lives in this separate package
```

### Step 2: Basic models

```python
# schemas.py
from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field, ValidationError

class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    age: int = Field(ge=13, le=120)
    role: str = Field(default="member", pattern=r"^(admin|member|viewer)$")

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)   # build from ORM objects
    id: str
    name: str
    role: str
    created_at: datetime

user = UserCreate(name="Maria Santos", email="maria@acme-bakery.com", age=28)
print(user.model_dump())        # {'name': 'Maria Santos', 'email': '...', 'age': 28, 'role': 'member'}
print(user.model_dump_json())   # JSON string

try:
    UserCreate(name="A", email="nope", age=5)
except ValidationError as e:
    print(e.error_count())                                   # 3
    print([(x["type"], x["loc"]) for x in e.errors()])
    # [('string_too_short', ('name',)), ('value_error', ('email',)), ('greater_than_equal', ('age',))]

row = db.get_user(7)                       # any object with matching attributes
response = UserResponse.model_validate(row)   # needs from_attributes=True
```

`ValidationError` must be imported from `pydantic`. Parse JSON text directly with `UserCreate.model_validate_json(raw)`, which is faster and stricter than `json.loads` followed by `model_validate`.

### Step 3: Custom validators

```python
from datetime import datetime
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

Raise `ValueError` (or `AssertionError`); Pydantic wraps it as a `value_error` with the message prefixed "Value error, ". A `mode="after"` model validator is an instance method and must return `self`.

### Step 4: Settings from the environment

```python
# config.py
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str
    secret_key: SecretStr
    redis_url: str = "redis://localhost:6379"
    debug: bool = False
    allowed_origins: list[str] = ["http://localhost:3000"]

settings = Settings()      # reads environment variables first, then .env
```

Variable names match field names case-insensitively (`DATABASE_URL`). Complex types are passed as JSON: `ALLOWED_ORIGINS='["https://shop.example.org","https://admin.example.org"]'`. A missing required field raises `ValidationError` at startup, which is the point. `SecretStr` prints as `**********`; call `.get_secret_value()` to use it. By default `.env` entries that match no field raise an error; `extra="ignore"` skips them.

### Step 5: Discriminated unions

```python
from typing import Annotated, Literal
from pydantic import BaseModel, Field, TypeAdapter

class TaskCreated(BaseModel):
    type: Literal["task.created"] = "task.created"
    task_id: str
    title: str

class TaskCompleted(BaseModel):
    type: Literal["task.completed"] = "task.completed"
    task_id: str
    duration_hours: float

class CommentAdded(BaseModel):
    type: Literal["comment.added"] = "comment.added"
    comment_id: str
    body: str

WebhookEvent = Annotated[TaskCreated | TaskCompleted | CommentAdded, Field(discriminator="type")]
event_adapter = TypeAdapter(WebhookEvent)

event = event_adapter.validate_json('{"type": "task.completed", "task_id": "T-123", "duration_hours": 2.5}')
# TaskCompleted(type='task.completed', task_id='T-123', duration_hours=2.5)
```

A plain union (`A | B | C`) has no `model_validate`; wrap it in `TypeAdapter`. With `Field(discriminator=...)` Pydantic reads the tag and validates against one model only, so the error for an unknown tag is a single `union_tag_invalid` instead of one error per member. `TypeAdapter` also validates non-model types: `TypeAdapter(list[int]).validate_python(["1", "2"])` returns `[1, 2]`.

### Step 6: Strictness and extra fields

```python
from pydantic import BaseModel, ConfigDict

class Payment(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    amount_cents: int
```

By default Pydantic coerces (`"1"` to `1`) and ignores unknown keys. `strict=True` rejects the string (`int_type`); `extra="forbid"` rejects unknown keys (`extra_forbidden`). Use both for security-sensitive inputs. Export a JSON Schema with `UserCreate.model_json_schema()`.

## Examples

**"Validate the signup body in my FastAPI endpoint."** Declare `def signup(body: UserCreate)`; FastAPI runs the model and returns HTTP 422 with the `e.errors()` list when validation fails. Input `{"name": "A", "email": "nope", "age": 5}` yields three errors located at `name`, `email` and `age`.

**"Load config and fail fast if something is missing."** Use the `Settings` class from Step 4. With `SECRET_KEY` set and `DATABASE_URL` unset, `Settings()` raises `ValidationError: 1 validation error for Settings ... database_url Field required`, so the process exits before serving traffic.

## Guidelines

- Pydantic v1 names are gone or renamed: `.dict()` is `.model_dump()`, `.json()` is `.model_dump_json()`, `parse_obj` is `model_validate`, `@validator` is `@field_validator`, `@root_validator` is `@model_validator`, `class Config` is `model_config`, `orm_mode` is `from_attributes`, `regex=` is `pattern=`. `BaseSettings` moved to `pydantic-settings`. The `pydantic.v1` namespace exists only as a bridge.
- `EmailStr` needs the `email` extra; without it, import fails with a message pointing to `email-validator`.
- Mutable defaults like `[]` are safe in Pydantic (copied per instance), unlike in plain classes.
- Validators run on input, not on attribute assignment, unless `validate_assignment=True`.
- Never use `model_construct()` on untrusted data; it skips validation.
- Keep request models (`UserCreate`) and response models (`UserResponse`) separate so secrets such as password hashes cannot leak into responses.
