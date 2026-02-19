---
name: actix-web
description: |
  Actix Web is a powerful, high-performance web framework for Rust. It provides
  async handlers, type-safe extractors, middleware, and integrates with the Rust
  ecosystem for building fast, reliable, and memory-safe web services.
license: Apache-2.0
compatibility:
  - rust >= 1.72
  - cargo
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frameworks
  tags:
    - rust
    - web
    - api
    - async
    - performance
    - type-safe
---

# Actix Web

Actix Web is one of the fastest web frameworks available. It uses Rust's type system for compile-time safety, async/await for concurrency, and extractors for ergonomic request handling.

## Dependencies

```toml
# Cargo.toml — dependencies
[dependencies]
actix-web = "4"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sqlx = { version = "0.7", features = ["runtime-tokio", "postgres", "macros"] }
tokio = { version = "1", features = ["full"] }
env_logger = "0.11"
```

## Main Setup

```rust
// src/main.rs — application entry point
use actix_web::{web, App, HttpServer, middleware::Logger};
use sqlx::postgres::PgPoolOptions;

mod routes;
mod models;
mod errors;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&std::env::var("DATABASE_URL").unwrap())
        .await.expect("Failed to create pool");

    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .app_data(web::Data::new(pool.clone()))
            .configure(routes::configure)
    })
    .bind("0.0.0.0:8080")?
    .run()
    .await
}
```

## Routes

```rust
// src/routes/mod.rs — route registration
use actix_web::web;
mod articles;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/articles")
            .route("", web::get().to(articles::list))
            .route("", web::post().to(articles::create))
            .route("/{id}", web::get().to(articles::get))
    );
}
```

## Models

```rust
// src/models.rs — data models with serde
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, FromRow)]
pub struct Article {
    pub id: i32,
    pub title: String,
    pub body: String,
    pub published: bool,
    pub created_at: chrono::NaiveDateTime,
}

#[derive(Debug, Deserialize)]
pub struct CreateArticle {
    pub title: String,
    pub body: String,
}

#[derive(Debug, Deserialize)]
pub struct ListParams {
    pub page: Option<u32>,
    pub limit: Option<u32>,
}
```

## Handlers with Extractors

```rust
// src/routes/articles.rs — request handlers
use actix_web::{web, HttpResponse};
use sqlx::PgPool;
use crate::models::{Article, CreateArticle, ListParams};
use crate::errors::AppError;

pub async fn list(
    pool: web::Data<PgPool>,
    query: web::Query<ListParams>,
) -> Result<HttpResponse, AppError> {
    let limit = query.limit.unwrap_or(20).min(100) as i64;
    let offset = ((query.page.unwrap_or(1) - 1) * limit as u32) as i64;

    let articles = sqlx::query_as::<_, Article>(
        "SELECT * FROM articles WHERE published = true ORDER BY created_at DESC LIMIT $1 OFFSET $2"
    )
    .bind(limit).bind(offset)
    .fetch_all(pool.get_ref()).await?;

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
    .fetch_one(pool.get_ref()).await?;

    Ok(HttpResponse::Created().json(article))
}

pub async fn get(
    pool: web::Data<PgPool>,
    path: web::Path<i32>,
) -> Result<HttpResponse, AppError> {
    let article = sqlx::query_as::<_, Article>("SELECT * FROM articles WHERE id = $1")
        .bind(path.into_inner())
        .fetch_optional(pool.get_ref()).await?
        .ok_or(AppError::NotFound)?;

    Ok(HttpResponse::Ok().json(article))
}
```

## Error Handling

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
            AppError::NotFound => write!(f, "Not found"),
            AppError::Database(e) => write!(f, "Database error: {}", e),
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

## Testing

```rust
// tests/articles_test.rs — integration test
use actix_web::{test, App, web};

#[actix_web::test]
async fn test_list_articles() {
    let pool = setup_test_db().await;
    let app = test::init_service(
        App::new().app_data(web::Data::new(pool)).configure(routes::configure)
    ).await;

    let req = test::TestRequest::get().uri("/api/articles").to_request();
    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), 200);
}
```

## Key Patterns

- Use extractors (`web::Json`, `web::Path`, `web::Query`, `web::Data`) for type-safe request parsing
- Implement `ResponseError` on custom error types for automatic HTTP error responses
- Use `web::Data` for shared state (DB pool, config) — it's cheaply cloneable
- Use `sqlx::query!` macro for compile-time checked queries in production
