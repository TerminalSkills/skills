---
name: axum
category: Backend Development
tags: [rust, web-framework, async, tokio, tower, api, type-safe]
version: 1.0.0
author: terminal-skills
---

# Axum — Ergonomic Rust Web Framework

You are an expert in Axum, the web framework built on top of Tokio and Tower by the Tokio team. You help developers build high-performance, type-safe APIs and web services using Axum's extractor-based handler system, middleware via Tower layers, WebSocket support, and compile-time route validation — achieving C-level performance with Rust's memory safety guarantees.

## Core Capabilities

### Application Setup

```rust
// src/main.rs — Axum API server
use axum::{
    Router, Json, Extension,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post, put, delete},
    middleware,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

#[derive(Clone)]
struct AppState {
    db: PgPool,
    redis: redis::Client,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::init();

    let db = PgPool::connect(&std::env::var("DATABASE_URL").unwrap())
        .await.unwrap();

    let state = AppState {
        db,
        redis: redis::Client::open("redis://127.0.0.1/").unwrap(),
    };

    let app = Router::new()
        .route("/users", get(list_users).post(create_user))
        .route("/users/{id}", get(get_user).put(update_user).delete(delete_user))
        .route("/health", get(|| async { "OK" }))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

### Handlers and Extractors

```rust
// Extractors pull data from requests — type-safe at compile time

#[derive(Deserialize)]
struct CreateUserRequest {
    name: String,
    email: String,
}

#[derive(Serialize)]
struct UserResponse {
    id: i64,
    name: String,
    email: String,
    created_at: chrono::NaiveDateTime,
}

// State, Path, Query, Json are all extractors
async fn create_user(
    State(state): State<AppState>,        // Application state
    Json(payload): Json<CreateUserRequest>, // Request body
) -> Result<(StatusCode, Json<UserResponse>), AppError> {
    let user = sqlx::query_as!(
        UserResponse,
        "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *",
        payload.name,
        payload.email,
    )
    .fetch_one(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(user)))
}

async fn get_user(
    State(state): State<AppState>,
    Path(id): Path<i64>,                  // URL path parameter
) -> Result<Json<UserResponse>, AppError> {
    let user = sqlx::query_as!(UserResponse, "SELECT * FROM users WHERE id = $1", id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(user))
}

#[derive(Deserialize)]
struct ListParams {
    page: Option<u32>,
    per_page: Option<u32>,
}

async fn list_users(
    State(state): State<AppState>,
    Query(params): Query<ListParams>,     // Query string parameters
) -> Result<Json<Vec<UserResponse>>, AppError> {
    let page = params.page.unwrap_or(1);
    let per_page = params.per_page.unwrap_or(20).min(100);
    let offset = ((page - 1) * per_page) as i64;

    let users = sqlx::query_as!(
        UserResponse,
        "SELECT * FROM users ORDER BY id LIMIT $1 OFFSET $2",
        per_page as i64,
        offset,
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(users))
}
```

### Error Handling

```rust
use axum::response::IntoResponse;

enum AppError {
    NotFound,
    Database(sqlx::Error),
    Unauthorized,
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match self {
            AppError::NotFound => (StatusCode::NOT_FOUND, "Resource not found"),
            AppError::Database(e) => {
                tracing::error!("Database error: {e}");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error")
            }
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "Unauthorized"),
        };
        (status, Json(serde_json::json!({ "error": message }))).into_response()
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self { AppError::Database(e) }
}
```

### Middleware

```rust
use axum::middleware::Next;
use axum::http::Request;

async fn auth_middleware(
    State(state): State<AppState>,
    mut req: Request<axum::body::Body>,
    next: Next,
) -> Result<impl IntoResponse, AppError> {
    let token = req.headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or(AppError::Unauthorized)?;

    let user = validate_token(&state.db, token).await?;
    req.extensions_mut().insert(user);
    Ok(next.run(req).await)
}

// Apply to specific routes
let protected = Router::new()
    .route("/profile", get(get_profile))
    .layer(middleware::from_fn_with_state(state.clone(), auth_middleware));
```

## Installation

```toml
# Cargo.toml
[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sqlx = { version = "0.8", features = ["runtime-tokio", "postgres"] }
tower-http = { version = "0.6", features = ["cors", "trace"] }
tracing = "0.1"
tracing-subscriber = "0.3"
```

## Best Practices

1. **Extractors for everything** — State, Path, Query, Json, Headers — all type-checked at compile time
2. **Tower middleware** — Use Tower layers for cross-cutting concerns (CORS, tracing, rate limiting, compression)
3. **sqlx for database** — Compile-time checked SQL queries with `query_as!` macro; catches SQL errors before runtime
4. **Custom error types** — Implement `IntoResponse` for error enums; consistent error responses across all handlers
5. **Shared state via State** — Use `with_state()` for database pools, config, caches; cloned cheaply via Arc internally
6. **Graceful shutdown** — Use `tokio::signal` to handle SIGTERM; Axum drains connections before stopping
7. **WebSockets** — Axum has built-in WebSocket support via `extract::ws::WebSocket`; integrates with Tower middleware
8. **Performance** — Axum consistently tops TechEmpower benchmarks; zero-cost abstractions compile away at release
