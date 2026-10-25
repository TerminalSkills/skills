---
name: actix-web
description: |
  Actix Web is a high-performance async web framework for Rust. It provides type-safe extractors, routing, middleware and a built-in test harness for building fast, memory-safe HTTP APIs. Use when a user asks to build a Rust REST API, add an Actix handler or middleware, handle errors with ResponseError, share a database pool, or test an Actix service.
license: Apache-2.0
compatibility: 'Rust >= 1.89 (actix-web 4.18), cargo, PostgreSQL for the sqlx examples'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/actix/actix-web
  tags: "rust, web, api, async, performance"
---

# Actix Web

## Overview

Actix Web (current release 4.18, MSRV 1.89) is a Rust web framework built on async/await, with extractors for type-safe request parsing and a `ResponseError` trait for error-to-response mapping. The examples below build a small articles API on PostgreSQL via `sqlx`. They were checked against the actix-web 4.18 sources and docs, not compiled here, so run `cargo check` after pasting.

## Instructions

### Installation

```console
$ cargo new articles-api && cd articles-api
$ cargo add actix-web@4 env_logger@0.11 serde_json@1
$ cargo add serde@1 --features derive
$ cargo add chrono@0.4 --features serde
$ cargo add sqlx@0.8 --features runtime-tokio,postgres,macros,chrono
```

`actix-rt` and a direct `tokio` dependency are not needed: `#[actix_web::main]` and `#[actix_web::test]` come with `actix-web`. sqlx 0.9 also exists (MSRV 1.94; `query*()` accept only `&'static str` or `AssertSqlSafe(..)`), which these literal queries satisfy.

```sql
CREATE TABLE articles (
  id SERIAL PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMP NOT NULL DEFAULT now()
);
```

### Main and Server Setup

```rust
// src/main.rs — application entry point
use actix_web::{middleware::Logger, web, App, HttpServer};
use sqlx::postgres::PgPoolOptions;

mod errors; mod middleware; mod models; mod routes;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Logger writes through the `log` crate; set RUST_LOG=info to see requests
    env_logger::init();

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://articles:articles@127.0.0.1/articles".to_string());

    let pool = PgPoolOptions::new().max_connections(10)
        .connect(&database_url).await.expect("Failed to create pool");

    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .app_data(web::Data::new(pool.clone())) // PgPool is already an Arc inside
            .app_data(web::JsonConfig::default().limit(64 * 1024)) // default is 2 MiB
            .configure(routes::configure)
    })
    // 127.0.0.1 for local work; use 0.0.0.0 only inside a container behind a proxy
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}
```

Each `mod` also needs its file: `src/models/mod.rs` with `pub mod article;`, `src/middleware/mod.rs` with `pub mod auth;`, and `src/routes/health.rs` with a `pub async fn check`, like the one in Testing below.
### Route Configuration

```rust
// src/routes/mod.rs
use actix_web::{middleware::from_fn, web};

mod articles; mod health;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api")
            .route("/health", web::get().to(health::check))
            .service(
                web::scope("/articles")
                    .route("", web::get().to(articles::list))
                    .route("/{id}", web::get().to(articles::get)),
            )
            // writes live under a separate scope so only they need the API key
            .service(
                web::scope("/admin/articles")
                    .wrap(from_fn(crate::middleware::auth::require_api_key))
                    .route("", web::post().to(articles::create)),
            ),
    );
}
```

### Models

```rust
// src/models/article.rs — data models with serde
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, FromRow)]
pub struct Article {
    pub id: i32, pub title: String, pub body: String, pub published: bool,
    pub created_at: chrono::NaiveDateTime, // needs chrono's "serde" feature
}

#[derive(Debug, Deserialize)]
pub struct CreateArticle { pub title: String, pub body: String }

#[derive(Debug, Deserialize)]
pub struct ListParams { pub page: Option<u32>, pub limit: Option<u32> }
```

### Handlers with Extractors

```rust
// src/routes/articles.rs — request handlers
use actix_web::{web, HttpResponse};
use sqlx::PgPool;
use crate::models::article::{Article, CreateArticle, ListParams};
use crate::errors::AppError;

pub async fn list(
    pool: web::Data<PgPool>,
    query: web::Query<ListParams>,
) -> Result<HttpResponse, AppError> {
    let limit = query.limit.unwrap_or(20).min(100) as i64;
    let offset = (query.page.unwrap_or(1).saturating_sub(1) as i64) * limit; // page 0 must not underflow

    let articles = sqlx::query_as::<_, Article>(
        "SELECT * FROM articles WHERE published ORDER BY created_at DESC LIMIT $1 OFFSET $2",
    )
    .bind(limit).bind(offset)
    .fetch_all(pool.get_ref())
    .await?;

    Ok(HttpResponse::Ok().json(articles))
}

pub async fn create(
    pool: web::Data<PgPool>,
    body: web::Json<CreateArticle>,
) -> Result<HttpResponse, AppError> {
    let article = sqlx::query_as::<_, Article>(
        "INSERT INTO articles (title, body) VALUES ($1, $2) RETURNING *"
    )
    .bind(&body.title).bind(&body.body)
    .fetch_one(pool.get_ref())
    .await?;

    Ok(HttpResponse::Created().json(article))
}
```

The `get` handler (`fetch_optional(..).await?.ok_or(AppError::NotFound)?`, registered at `/{id}`) follows the same shape as `create`, with `web::Path<i32>` instead of `web::Json`.

### Error Handling

```rust
// src/errors.rs — custom error types
use actix_web::{HttpResponse, ResponseError};
use std::fmt;

#[derive(Debug)]
pub enum AppError {
    NotFound,
    Database(sqlx::Error),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::NotFound => write!(f, "not found"),
            AppError::Database(e) => write!(f, "database error: {e}"),
        }
    }
}

impl ResponseError for AppError {
    fn error_response(&self) -> HttpResponse {
        match self {
            AppError::NotFound => HttpResponse::NotFound().json(serde_json::json!({"error": "not found"})),
            _ => HttpResponse::InternalServerError().json(serde_json::json!({"error": "internal error"})),
        }
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self { AppError::Database(e) }
}
```

### Middleware

In current 4.x an async function can be middleware through `middleware::from_fn`; no `Transform`/`Service` boilerplate is needed. This one rejects requests without the right API key (read from the environment, compared in full):

```rust
// src/middleware/auth.rs — API-key check as a from_fn middleware
use actix_web::{
    body::MessageBody,
    dev::{ServiceRequest, ServiceResponse},
    error::ErrorUnauthorized,
    middleware::Next,
    Error,
};

pub async fn require_api_key(
    req: ServiceRequest,
    next: Next<impl MessageBody>,
) -> Result<ServiceResponse<impl MessageBody>, Error> {
    let expected = std::env::var("ARTICLES_API_KEY").unwrap_or_default();
    let given = req
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));

    match given {
        Some(key) if !expected.is_empty() && key == expected => next.call(req).await,
        _ => Err(ErrorUnauthorized("missing or invalid token")),
    }
}
```

Apply it with `.wrap(from_fn(require_api_key))` on an `App`, `Scope` or `Resource`. Wraps run in reverse order of registration: the last `.wrap()` sees the request first. For JWT or OAuth, use a maintained crate (`actix-web-httpauth` provides the Bearer extractor) rather than hand-rolling token parsing.

### Testing

Integration tests in `tests/` can only import a library crate, so put `pub fn configure` in `src/lib.rs` and have `main.rs` use it. A handler that needs no database can be tested in isolation:

```rust
// tests/health_test.rs — integration test with the built-in harness
use actix_web::{http::StatusCode, test, web, App, HttpResponse};

async fn check() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({"status": "ok"}))
}

#[actix_web::test]
async fn health_returns_ok() {
    let app = test::init_service(App::new().route("/api/health", web::get().to(check))).await;
    let req = test::TestRequest::get().uri("/api/health").to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);
}
```

For database tests, `#[sqlx::test(migrations = "./migrations")]` provides a fresh `PgPool` per test.

## Examples

### Create and read an article

User request: "Add an article and fetch it back with curl."

```console
$ ARTICLES_API_KEY=k-7f3a91 DATABASE_URL=postgres://articles:articles@127.0.0.1/articles cargo run
$ curl -s -X POST http://127.0.0.1:8080/api/admin/articles \
    -H 'Authorization: Bearer k-7f3a91' -H 'Content-Type: application/json' \
    -d '{"title":"Hello Actix","body":"First post"}'
{"id":1,"title":"Hello Actix","body":"First post","published":true,"created_at":"2026-10-24T13:41:07.512"}
$ curl -s http://127.0.0.1:8080/api/articles/1 -o /dev/null -w '%{http_code}\n'
200
$ curl -s -X POST http://127.0.0.1:8080/api/admin/articles -d '{}' -w '%{http_code}\n'
missing or invalid token401
```

### Unknown id returns a JSON 404

User request: "Return a clean error when an article does not exist."

```console
$ curl -s -i http://127.0.0.1:8080/api/articles/999 | sed -n '1p;$p'
HTTP/1.1 404 Not Found
{"error":"not found"}
```

## Guidelines

- Extractors fail with an automatic 400/404/415 before your handler runs; `web::Json` rejects bodies over 2 MiB by default, so set `JsonConfig::limit` to what the API really needs.
- Never `.unwrap()` or block in a handler: a blocking call (sync file or DB driver, heavy CPU) stalls that worker's thread. Use `web::block(|| ..)` for unavoidable blocking work.
- Each worker thread builds its own `App` from the `HttpServer::new` closure. Create shared state (pool, config) outside the closure and `clone()` it in; state created inside is duplicated per worker. Default worker count is the number of physical cores (`.workers(n)` to change).
- Do not return `sqlx::Error` text to clients. Log it, send a generic message (as `AppError` does above).
- Bind `127.0.0.1` in development; `0.0.0.0` only in a container behind a reverse proxy that terminates TLS (or use `bind_rustls_0_23`).
