---
name: axum
description: >-
  Builds HTTP APIs and web services in Rust with Axum, the Tokio team's web framework on top of Tokio, Hyper and Tower. Use when a user asks to create a Rust REST API, add routes, extractors, JSON handlers, shared state, middleware, error handling, WebSockets, graceful shutdown or tests with Axum, or to migrate older Axum code (0.6/0.7 path syntax) to 0.8.
license: Apache-2.0
compatibility: "Axum 0.8 (current stable 0.8.9), Rust 1.80 or newer, Tokio 1.x; examples also use sqlx 0.9 and tower-http 0.7"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["rust", "web-framework", "async", "tokio", "tower"]
  repository: https://github.com/tokio-rs/axum
---

# Axum — Ergonomic Rust Web Framework

## Overview

Axum is a web framework from the Tokio project. Handlers are plain `async fn`s whose arguments are **extractors** (`Path`, `Query`, `Json`, `State`, headers) and whose return value implements `IntoResponse`. Routing is a `Router`; cross-cutting concerns (CORS, tracing, timeouts, compression, auth) are Tower layers, so everything in `tower` and `tower-http` works unchanged. Axum has no macro DSL and no runtime of its own: `axum::serve` runs a `Router` on a Tokio `TcpListener`.

Wrong extractor combinations are compile errors, but route paths are checked when the router is built: an invalid or overlapping path panics at startup, not at compile time.

## Instructions

### Project setup

```bash
cargo new shop-api && cd shop-api
cargo add axum@0.8 --features ws,macros
cargo add tokio --features full
cargo add serde --features derive
cargo add serde_json tracing tracing-subscriber
cargo add tower-http@0.7 --features cors,trace
cargo add sqlx@0.9 --features runtime-tokio,postgres,chrono
cargo add chrono --features serde
cargo add --dev tower --features util
cargo add --dev http-body-util
```

Default Axum features already include `json`, `query`, `form`, `http1`, `tokio` and `tracing`. `ws` (WebSockets), `multipart`, `http2` and `macros` (`#[debug_handler]`) are opt-in. Migrations and offline query checking come from `sqlx-cli` (`cargo install sqlx-cli`).

### Application, routes and state

Path captures use braces: `/users/{id}` and `/files/{*rest}`. The pre-0.8 forms `/:id` and `/*rest` panic at startup ("Path segments must not start with `:`"). Shared state must be `Clone`; a `PgPool` is already a cheap handle.

```rust
// src/main.rs (verified to compile and pass its tests with axum 0.8.9, sqlx 0.9.0, tower-http 0.7.1)
use axum::{
    Json, Router,
    extract::{Path, Query, Request, State, ws::{Message, WebSocket, WebSocketUpgrade}},
    http::{StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[derive(Clone)]
struct AppState {
    db: PgPool,
}

fn app(state: AppState) -> Router {
    let protected = Router::new()
        .route("/users", get(list_users).post(create_user))
        .route("/users/{id}", get(get_user))
        .route_layer(middleware::from_fn(require_token));
    Router::new()
        .route("/health", get(|| async { "OK" }))
        .route("/ws", get(ws_handler))
        .merge(protected)
        .layer(CorsLayer::new())          // add allowed origins explicitly, see Guidelines
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c().await.expect("failed to listen for ctrl-c");
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let db = PgPool::connect(&database_url).await.expect("cannot connect to Postgres");
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app(AppState { db }))
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();
}
```

`tracing_subscriber::fmt::init()` is the initialiser (there is no `tracing_subscriber::init()`). Without `with_graceful_shutdown` the server never drains connections on SIGINT/SIGTERM.

### Handlers and extractors

Extractors run in argument order; the one that consumes the request body (`Json`, `Form`, `String`, `Bytes`) must be **last**.

```rust
#[derive(Serialize, sqlx::FromRow)]
struct User { id: i64, name: String, email: String, created_at: chrono::NaiveDateTime }

#[derive(Deserialize)]
struct CreateUser { name: String, email: String }

#[derive(Deserialize)]
struct ListParams { page: Option<u32>, per_page: Option<u32> }

async fn create_user(
    State(state): State<AppState>,
    Json(payload): Json<CreateUser>,
) -> Result<(StatusCode, Json<User>), AppError> {
    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email, created_at",
    )
    .bind(payload.name)
    .bind(payload.email)
    .fetch_one(&state.db)
    .await?;
    Ok((StatusCode::CREATED, Json(user)))
}

async fn get_user(State(state): State<AppState>, Path(id): Path<i64>) -> Result<Json<User>, AppError> {
    let user = sqlx::query_as::<_, User>("SELECT id, name, email, created_at FROM users WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(user))
}

async fn list_users(
    State(state): State<AppState>,
    Query(params): Query<ListParams>,
) -> Result<Json<Vec<User>>, AppError> {
    let per_page = params.per_page.unwrap_or(20).min(100) as i64;
    let offset = (params.page.unwrap_or(1).max(1) as i64 - 1) * per_page;
    let users = sqlx::query_as::<_, User>(
        "SELECT id, name, email, created_at FROM users ORDER BY id LIMIT $1 OFFSET $2",
    )
    .bind(per_page)
    .bind(offset)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(users))
}
```

`sqlx::query_as::<_, T>` with `FromRow` needs no database at compile time. The `query!`/`query_as!` macros check SQL against a live `DATABASE_URL` (or cached `.sqlx/` data from `cargo sqlx prepare`) and fail the build without one. When a handler fails to compile with a baffling trait error, add `#[axum::debug_handler]` (feature `macros`) to get a readable message.

### Error handling

```rust
enum AppError { NotFound, Unauthorized, Database(sqlx::Error) }

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self { AppError::Database(e) }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AppError::NotFound => (StatusCode::NOT_FOUND, "resource not found"),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            AppError::Database(e) => {
                tracing::error!("database error: {e}");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal server error")
            }
        };
        (status, Json(serde_json::json!({ "error": message }))).into_response()
    }
}
```

The `?` operator converts through `From`, so handlers stay short. Log the real error, return a generic message.

### Middleware

`middleware::from_fn` turns an async function into a layer; it receives the `Request` and `Next`. Use `from_fn_with_state` when it needs `State`, and `route_layer` so unmatched routes still return 404 instead of 401.

```rust
async fn require_token(req: Request, next: Next) -> Result<Response, AppError> {
    let token = req.headers().get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));
    match token {
        Some(t) if !t.is_empty() && t == std::env::var("API_TOKEN").unwrap_or_default() => Ok(next.run(req).await),
        _ => Err(AppError::Unauthorized),
    }
}
```

Layer order: the layer added **last** runs **first** on the request. For several layers use `tower::ServiceBuilder`, which reads top to bottom.

### WebSockets

```rust
async fn ws_handler(ws: WebSocketUpgrade) -> Response { ws.on_upgrade(echo) }

async fn echo(mut socket: WebSocket) {
    while let Some(Ok(Message::Text(text))) = socket.recv().await {
        if socket.send(Message::Text(text)).await.is_err() { break; }
    }
}
```

Needs the `ws` feature. In 0.8 `Message::Text` holds a `Utf8Bytes` value, not a `String`; convert with `.as_str()` or `.into()`.

### Testing without a network

Call the router as a Tower service with `oneshot`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    #[tokio::test]
    async fn health_returns_ok() {
        let db = PgPool::connect_lazy("postgres://localhost/unused").unwrap();
        let response = app(AppState { db })
            .oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap())
            .await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = response.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(&body[..], b"OK");
    }
}
```

### Upgrading from 0.6 / 0.7

- Paths: `/:id` becomes `/{id}`, `/*rest` becomes `/{*rest}` (0.8).
- Custom extractors no longer use `#[async_trait]`; implement `FromRequestParts` with a plain `async fn`.
- `Option<T>` as an extractor needs `T: OptionalFromRequestParts`; use `Result<T, T::Rejection>` to see why extraction failed.
- Serve with `axum::serve(listener, app)`; `axum::Server` (Hyper 0.14) is gone since 0.7.

## Examples

### Example 1: Create and call the API

User request: "Give me a small users API in Rust with Postgres and a bearer token."

```bash
export DATABASE_URL=postgres://shop:shop@127.0.0.1:5432/shop API_TOKEN=local-dev-token
cargo run &
curl -s -X POST localhost:3000/users -H 'Authorization: Bearer local-dev-token' \
  -H 'Content-Type: application/json' -d '{"name":"Maria Silva","email":"maria@shopfront.dev"}'
curl -s localhost:3000/users/1 -H 'Authorization: Bearer local-dev-token'
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/users
```

Result: the first call returns `201` with `{"id":1,"name":"Maria Silva","email":"maria@shopfront.dev","created_at":"..."}`, the second returns the same user, and the call without a token prints `401`. A missing id returns `404` with `{"error":"resource not found"}`.

### Example 2: Run the tests

User request: "Test the health route and the auth check without starting Postgres."

```bash
cargo test
# running 2 tests
# test tests::users_require_token ... ok
# test tests::health_returns_ok ... ok
```

`PgPool::connect_lazy` never opens a connection until a query runs, so route and middleware tests need no database.

## Guidelines

- Pin `axum = "0.8"` and use the matching `axum-extra` (0.12) and `tower-http`; mixing Axum with `http`/`hyper` major versions from other crates causes confusing trait errors.
- Never use `CorsLayer::permissive()` outside local development; list origins with `CorsLayer::new().allow_origin(...)`.
- Keep blocking work (password hashing, large file IO, CPU loops) out of handlers or wrap it in `tokio::task::spawn_blocking`; it stalls the runtime thread otherwise.
- Never hold a `std::sync::Mutex` guard across an `.await`; use `tokio::sync::Mutex` or restructure.
- Limit request bodies: Axum caps `Bytes`/`Json` bodies at 2 MB by default; change it with `DefaultBodyLimit`.
- Do not log secrets: `TraceLayer` logs URIs, so keep tokens in headers, not in query strings.
- Do not hand-roll auth: use a vetted JWT/session crate and constant-time token comparison for anything beyond a local demo.
- Pick Axum for new async Rust services; for a large existing Actix codebase, rewriting is rarely worth it.
