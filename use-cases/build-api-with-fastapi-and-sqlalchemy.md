---
title: Build a Production REST API with FastAPI and SQLAlchemy
slug: build-api-with-fastapi-and-sqlalchemy
description: Build a production-ready REST API with FastAPI, SQLAlchemy async ORM, Alembic migrations, and JWT authentication. Covers project structure, CRUD operations, testing, and deployment.
skills:
  - fastapi
  - postgresql
category: use-cases
tags:
  - python
  - api
  - rest
  - async
  - jwt
  - sqlalchemy
---

# Build a Production REST API with FastAPI and SQLAlchemy

This walkthrough builds a production-ready REST API for a bookmarks service using FastAPI, async SQLAlchemy, Alembic for migrations, and JWT authentication. By the end, you'll have a well-structured API with auth, CRUD, pagination, and tests.

## Step 1: Project Setup

```bash
# Terminal — create project and install dependencies
mkdir bookmarks-api && cd bookmarks-api
python -m venv venv
source venv/bin/activate
pip install "fastapi[standard]" sqlalchemy[asyncio] asyncpg alembic python-jose[cryptography] passlib[bcrypt] pydantic-settings pytest-asyncio httpx
```

Create the project structure:

```bash
# Terminal — scaffold the project
mkdir -p app/{routers,models,schemas,core} tests
touch app/__init__.py app/routers/__init__.py app/models/__init__.py app/schemas/__init__.py app/core/__init__.py
```

## Step 2: Configuration

```python
# app/core/config.py — settings with pydantic-settings
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost/bookmarks"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    model_config = {"env_file": ".env"}

settings = Settings()
```

## Step 3: Database Setup

```python
# app/core/database.py — async SQLAlchemy engine and session
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from .config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with async_session() as session:
        yield session
```

## Step 4: Models

```python
# app/models/user.py — user model
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    bookmarks: Mapped[list["Bookmark"]] = relationship(back_populates="owner", cascade="all, delete")
```

```python
# app/models/bookmark.py — bookmark model
from datetime import datetime, UTC
from sqlalchemy import String, Text, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

class Bookmark(Base):
    __tablename__ = "bookmarks"

    id: Mapped[int] = mapped_column(primary_key=True)
    url: Mapped[str] = mapped_column(String(2048))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    owner: Mapped["User"] = relationship(back_populates="bookmarks")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

## Step 5: Schemas

```python
# app/schemas/user.py — user request/response schemas
from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    username: str
    model_config = {"from_attributes": True}

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
```

```python
# app/schemas/bookmark.py — bookmark schemas
from pydantic import BaseModel, HttpUrl, Field
from datetime import datetime

class BookmarkCreate(BaseModel):
    url: HttpUrl
    title: str = Field(..., max_length=200)
    description: str | None = None

class BookmarkUpdate(BaseModel):
    title: str | None = Field(None, max_length=200)
    description: str | None = None

class BookmarkResponse(BaseModel):
    id: int
    url: str
    title: str
    description: str | None
    created_at: datetime
    model_config = {"from_attributes": True}
```

## Step 6: Authentication

```python
# app/core/auth.py — JWT auth utilities
from datetime import datetime, timedelta, UTC
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .config import settings
from .database import get_db
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(user_id: int) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode({"sub": str(user_id), "exp": expire}, settings.secret_key, algorithm=settings.algorithm)

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> User:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id = int(payload["sub"])
    except (JWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
```

## Step 7: Routes

```python
# app/routers/auth.py — authentication routes
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.auth import hash_password, verify_password, create_access_token
from app.models.user import User
from app.schemas.user import UserCreate, UserResponse, Token

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", response_model=UserResponse, status_code=201)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(email=data.email, username=data.username, hashed_password=hash_password(data.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

@router.post("/login", response_model=Token)
async def login(form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == form.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return Token(access_token=create_access_token(user.id))
```

```python
# app/routers/bookmarks.py — CRUD routes for bookmarks
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.models.bookmark import Bookmark
from app.schemas.bookmark import BookmarkCreate, BookmarkUpdate, BookmarkResponse

router = APIRouter(prefix="/bookmarks", tags=["bookmarks"])

@router.get("/", response_model=list[BookmarkResponse])
async def list_bookmarks(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Bookmark)
        .where(Bookmark.owner_id == user.id)
        .order_by(Bookmark.created_at.desc())
        .offset(skip).limit(limit)
    )
    return result.scalars().all()

@router.post("/", response_model=BookmarkResponse, status_code=201)
async def create_bookmark(
    data: BookmarkCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bookmark = Bookmark(url=str(data.url), title=data.title, description=data.description, owner_id=user.id)
    db.add(bookmark)
    await db.commit()
    await db.refresh(bookmark)
    return bookmark

@router.get("/{bookmark_id}", response_model=BookmarkResponse)
async def get_bookmark(bookmark_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Bookmark).where(Bookmark.id == bookmark_id, Bookmark.owner_id == user.id))
    bookmark = result.scalar_one_or_none()
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    return bookmark

@router.patch("/{bookmark_id}", response_model=BookmarkResponse)
async def update_bookmark(
    bookmark_id: int, data: BookmarkUpdate,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Bookmark).where(Bookmark.id == bookmark_id, Bookmark.owner_id == user.id))
    bookmark = result.scalar_one_or_none()
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(bookmark, field, value)
    await db.commit()
    await db.refresh(bookmark)
    return bookmark

@router.delete("/{bookmark_id}", status_code=204)
async def delete_bookmark(bookmark_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Bookmark).where(Bookmark.id == bookmark_id, Bookmark.owner_id == user.id))
    bookmark = result.scalar_one_or_none()
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    await db.delete(bookmark)
    await db.commit()
```

## Step 8: Application Entry Point

```python
# app/main.py — FastAPI application
from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.routers import auth, bookmarks

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(title="Bookmarks API", version="1.0.0", lifespan=lifespan)
app.include_router(auth.router)
app.include_router(bookmarks.router)

@app.get("/health")
async def health():
    return {"status": "ok"}
```

## Step 9: Alembic Migrations

```bash
# Terminal — initialize Alembic and create first migration
alembic init alembic
```

```python
# alembic/env.py — configure Alembic for async SQLAlchemy (replace target_metadata)
from app.core.database import Base
from app.models.user import User
from app.models.bookmark import Bookmark
target_metadata = Base.metadata
```

```bash
# Terminal — generate and run migration
alembic revision --autogenerate -m "Initial tables"
alembic upgrade head
```

## Step 10: Testing

```python
# tests/test_bookmarks.py — API tests
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

@pytest.fixture
async def auth_token(client):
    await client.post("/auth/register", json={"email": "test@example.com", "username": "test", "password": "testpass123"})
    resp = await client.post("/auth/login", data={"username": "test@example.com", "password": "testpass123"})
    return resp.json()["access_token"]

@pytest.mark.anyio
async def test_create_bookmark(client, auth_token):
    resp = await client.post(
        "/bookmarks/",
        json={"url": "https://example.com", "title": "Example"},
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert resp.status_code == 201
    assert resp.json()["title"] == "Example"

@pytest.mark.anyio
async def test_list_bookmarks_unauthorized(client):
    resp = await client.get("/bookmarks/")
    assert resp.status_code == 401
```

## Running

```bash
# Terminal — run the API
uvicorn app.main:app --reload --port 8000

# Open http://localhost:8000/docs for interactive Swagger UI
```

## What You've Built

A production-grade API with async database access, JWT auth, input validation via Pydantic, automatic OpenAPI docs, Alembic migrations, and a test suite. This structure scales well — add more routers, models, and schemas as the API grows. The async stack handles high concurrency efficiently without threads.
