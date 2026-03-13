---
name: rocket
description: >-
  You are an expert in Rocket, the ergonomic Rust web framework that makes
  building web applications feel effortless. You help developers build
  type-safe HTTP APIs with Rocket's macro-based routing, request guards for
  authentication, form handling, JSON support, database integration, and
  fairings (middleware) — providing Rails-like productivity with Rust's
  compile-time safety guarantees.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Backend Development
  tags:
    - rust
    - web-framework
    - type-safe
    - async
    - macros
    - api
---

# Rocket — Type-Safe Rust Web Framework

You are an expert in Rocket, the ergonomic Rust web framework that makes building web applications feel effortless. You help developers build type-safe HTTP APIs with Rocket's macro-based routing, request guards for authentication, form handling, JSON support, database integration, and fairings (middleware) — providing Rails-like productivity with Rust's compile-time safety guarantees.

## Core Capabilities

### Routes and Handlers

```rust
#[macro_use] extern crate rocket;
use rocket::serde::{json::Json, Deserialize, Serialize};
use rocket::http::Status;

#[derive(Serialize, Deserialize, Clone)]
#[serde(crate = "rocket::serde")]
struct User {
    id: Option<u64>,
    name: String,
    email: String,
    role: String,
}

#[derive(Deserialize)]
#[serde(crate = "rocket::serde")]
struct CreateUser {
    name: String,
    email: String,
}

// GET /api/users?page=1&limit=20
#[get("/users?<page>&<limit>")]
async fn list_users(
    db: &State<DbPool>,
    page: Option<u32>,
    limit: Option<u32>,
) -> Json<Vec<User>> {
    let page = page.unwrap_or(1);
    let limit = limit.unwrap_or(20);
    let users = db.find_users(page, limit).await;
    Json(users)
}

// POST /api/users
#[post("/users", format = "json", data = "<input>")]
async fn create_user(
    db: &State<DbPool>,
    auth: AuthUser,                       // Request guard: rejects if not authenticated
    input: Json<CreateUser>,
) -> Result<(Status, Json<User>), Status> {
    if !auth.is_admin() {
        return Err(Status::Forbidden);
    }

    match db.create_user(&input.name, &input.email).await {
        Ok(user) => Ok((Status::Created, Json(user))),
        Err(_) => Err(Status::InternalServerError),
    }
}

// GET /api/users/<id>
#[get("/users/<id>")]
async fn get_user(db: &State<DbPool>, id: u64) -> Option<Json<User>> {
    db.find_user(id).await.map(Json)       // Returns 404 if None
}

#[launch]
fn rocket() -> _ {
    rocket::build()
        .attach(DbPool::init())
        .attach(Cors::fairing())
        .mount("/api", routes![list_users, create_user, get_user])
        .register("/", catchers![not_found, internal_error])
}

// Custom error catchers
#[catch(404)]
fn not_found() -> Json<serde_json::Value> {
    Json(serde_json::json!({"error": "not found"}))
}

#[catch(500)]
fn internal_error() -> Json<serde_json::Value> {
    Json(serde_json::json!({"error": "internal server error"}))
}
```

### Request Guards (Auth)

```rust
use rocket::request::{FromRequest, Outcome, Request};

struct AuthUser {
    id: u64,
    role: String,
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for AuthUser {
    type Error = &'static str;

    async fn from_request(request: &'r Request<'_>) -> Outcome<Self, Self::Error> {
        match request.headers().get_one("Authorization") {
            Some(token) => match validate_token(token).await {
                Ok(user) => Outcome::Success(user),
                Err(_) => Outcome::Error((Status::Unauthorized, "invalid token")),
            },
            None => Outcome::Error((Status::Unauthorized, "missing token")),
        }
    }
}
// Now just add `auth: AuthUser` to any handler parameter — Rocket enforces auth automatically
```

## Installation

```toml
# Cargo.toml
[dependencies]
rocket = { version = "0.5", features = ["json"] }
```

## Best Practices

1. **Request guards** — Use guards for auth, rate limiting, feature flags; enforced at compile time, impossible to forget
2. **Type-safe routes** — Path params, query params, body all type-checked; `Option<T>` for optional params
3. **Return `Option`/`Result`** — Return `None` for 404, `Err(Status)` for errors; Rocket maps automatically
4. **Fairings** — Use fairings for CORS, logging, DB connection pooling; runs on request/response lifecycle
5. **Managed state** — Use `State<T>` for shared resources (DB pool, config); thread-safe, injected by Rocket
6. **Custom catchers** — Register catchers for 404, 500, etc.; consistent error format across all routes
7. **Forms + validation** — Use `#[derive(FromForm)]` for query/form data; validates structure at compile time
8. **Async by default** — Rocket 0.5 is fully async; use `async fn` handlers for non-blocking I/O
