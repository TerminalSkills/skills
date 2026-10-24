---
name: rocket
description: >-
  Rocket is a Rust web framework for building type-safe HTTP APIs and web apps
  with attribute-macro routing, request guards, JSON and form handling, managed
  state and fairings. Use this skill when a user wants to write a Rust REST API
  with Rocket 0.5, add authentication through request guards, share a database
  pool, configure Rocket.toml, or unit-test routes with the local client.
license: Apache-2.0
compatibility: Rust 1.89+ (Rocket 0.5.2) with cargo; runs on stable Rust.
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/rwf2/Rocket
  tags:
    - rust
    - web-framework
    - type-safe
    - async
    - api
---

# Rocket — Type-Safe Rust Web Framework

## Overview

Rocket (crate `rocket`, current release 0.5.2 of 23 October 2026, Rust 1.89 or newer) is an async Rust web framework built on tokio. Routes are plain functions annotated with `#[get]`, `#[post]` and so on; path, query, body and header inputs are typed parameters, and a request that does not parse is rejected before your code runs. Cross-cutting concerns are request guards (types implementing `FromRequest`), managed state (`.manage(...)` and `&State<T>`), and fairings (lifecycle hooks). Rocket has no built-in CORS or database layer: use the separate `rocket_db_pools` crate (0.2) for databases, and a CORS crate or your own fairing. Rocket 0.5.2 is a security-fix release (updated rustls, tokio, hyper, time), so upgrade from earlier 0.5.x.

## Instructions

1. `cargo add rocket --features json` (add `secrets` for private cookies, `tls` for HTTPS). Put `#[macro_use] extern crate rocket;` at the top of `main.rs`.
2. Entry point: `#[launch] fn rocket() -> _ { rocket::build()... }`. Mount routes with `.mount("/api", routes![...])` and error handlers with `.register("/", catchers![...])`.
3. Serde derives must point at Rocket's re-export: add `#[serde(crate = "rocket::serde")]` to structs, or add `serde` as your own dependency and drop the attribute.
4. Return types map to responses: `Option<T>` gives 404 on `None`, `Result<T, Status>` gives the error status, `(Status, Json<T>)` sets the status, `Json<T>` serializes.
5. Query parameters: `#[get("/orders?<limit>")]` with `limit: Option<usize>`; body: `#[post("/orders", format = "json", data = "<input>")]` with `input: Json<NewOrder>`. Add `#[derive(FromForm)]` for form and multi-value query structs.
6. Authentication: implement `FromRequest` for a guard type and add it as a handler parameter. Return `Outcome::Error((Status::Unauthorized, ...))` (0.5 name; `Failure` was the 0.5 release-candidate name) to reject.
7. Shared state: `.manage(value)` and `&State<T>`; wrap mutable data in `Mutex`/`RwLock` or atomics.
8. Config comes from `Rocket.toml` and `ROCKET_*` environment variables (`ROCKET_PORT`, `ROCKET_ADDRESS`, `ROCKET_SECRET_KEY`, `ROCKET_PROFILE`). The default address is 127.0.0.1:8000; in a container set `ROCKET_ADDRESS=0.0.0.0`. JSON bodies are limited to 1 MiB by default; raise with `[default.limits] json = ...`.
9. Test without a network using `rocket::local::blocking::Client::tracked(rocket())` (or `local::asynchronous::Client`).
10. Database: add `rocket_db_pools` with a driver feature (e.g. `sqlx_sqlite`, `sqlx_postgres`), `#[derive(Database)] #[database("orders")] struct Db(sqlx::SqlitePool);`, configure `[default.databases.orders] url = "..."` in `Rocket.toml`, `.attach(Db::init())`, and take `Connection<Db>` as a handler parameter.

## Examples

### In-memory orders API with an API-key guard and a response fairing

Request: "Build a small JSON API for orders where creating needs an API key."

```toml
# Cargo.toml
[dependencies]
rocket = { version = "0.5", features = ["json"] }
```

```rust
#[macro_use]
extern crate rocket;

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use rocket::fairing::{Fairing, Info, Kind};
use rocket::http::{Header, Status};
use rocket::request::{FromRequest, Outcome, Request};
use rocket::serde::json::{serde_json::json, Json, Value};
use rocket::serde::{Deserialize, Serialize};
use rocket::{Response, State};

#[derive(Serialize, Deserialize, Clone)]
#[serde(crate = "rocket::serde")]
struct Order { id: u64, customer: String, total_cents: u64 }

#[derive(Deserialize)]
#[serde(crate = "rocket::serde")]
struct NewOrder { customer: String, total_cents: u64 }

struct Store { next_id: AtomicU64, orders: Mutex<Vec<Order>> }

struct ApiKey;

#[rocket::async_trait]
impl<'r> FromRequest<'r> for ApiKey {
    type Error = &'static str;
    async fn from_request(req: &'r Request<'_>) -> Outcome<Self, Self::Error> {
        match req.headers().get_one("x-api-key") {
            Some("secret-key-1") => Outcome::Success(ApiKey), // compare against a value from config in real code
            Some(_) => Outcome::Error((Status::Forbidden, "bad key")),
            None => Outcome::Error((Status::Unauthorized, "missing key")),
        }
    }
}

struct ServedBy;

#[rocket::async_trait]
impl Fairing for ServedBy {
    fn info(&self) -> Info { Info { name: "X-Served-By header", kind: Kind::Response } }
    async fn on_response<'r>(&self, _req: &'r Request<'_>, res: &mut Response<'r>) {
        res.set_header(Header::new("X-Served-By", "orders-api"));
    }
}

#[get("/orders?<limit>")]
fn list(store: &State<Store>, limit: Option<usize>) -> Json<Vec<Order>> {
    let orders = store.orders.lock().unwrap();
    Json(orders.iter().take(limit.unwrap_or(20)).cloned().collect())
}

#[get("/orders/<id>")]
fn get(store: &State<Store>, id: u64) -> Option<Json<Order>> {
    store.orders.lock().unwrap().iter().find(|o| o.id == id).cloned().map(Json)
}

#[post("/orders", format = "json", data = "<input>")]
fn create(_key: ApiKey, store: &State<Store>, input: Json<NewOrder>) -> (Status, Json<Order>) {
    let order = Order {
        id: store.next_id.fetch_add(1, Ordering::SeqCst),
        customer: input.customer.clone(),
        total_cents: input.total_cents,
    };
    store.orders.lock().unwrap().push(order.clone());
    (Status::Created, Json(order))
}

#[catch(404)]
fn not_found() -> Value { json!({ "error": "not found" }) }

#[catch(401)]
fn unauthorized() -> Value { json!({ "error": "unauthorized" }) }

#[launch]
fn rocket() -> _ {
    rocket::build()
        .manage(Store { next_id: AtomicU64::new(1), orders: Mutex::new(vec![]) })
        .attach(ServedBy)
        .mount("/api", routes![list, get, create])
        .register("/", catchers![not_found, unauthorized])
}
```

Result (checked with `cargo run` and curl): `POST /api/orders` without the header returns 401 `{"error":"unauthorized"}`; with `x-api-key: secret-key-1` it returns 201 `{"id":1,"customer":"Maria Lopez","total_cents":4999}`; `GET /api/orders/9` returns 404 `{"error":"not found"}`; every response carries `x-served-by: orders-api`.

### Testing routes with the local client

```rust
#[cfg(test)]
mod tests {
    use super::rocket;
    use rocket::http::{ContentType, Header, Status};
    use rocket::local::blocking::Client;

    #[test]
    fn create_requires_key() {
        let client = Client::tracked(rocket()).unwrap();
        let body = r#"{"customer":"Maria Lopez","total_cents":4999}"#;
        let res = client.post("/api/orders").header(ContentType::JSON).body(body).dispatch();
        assert_eq!(res.status(), Status::Unauthorized);
        let res = client.post("/api/orders").header(ContentType::JSON)
            .header(Header::new("x-api-key", "secret-key-1")).body(body).dispatch();
        assert_eq!(res.status(), Status::Created);
    }
}
```

### SQLite through rocket_db_pools

```toml
[dependencies.rocket_db_pools]
version = "0.2"
features = ["sqlx_sqlite"]
```

```toml
# Rocket.toml
[default.databases.orders]
url = "orders.sqlite"
```

```rust
use rocket_db_pools::{sqlx, Connection, Database};

#[derive(Database)]
#[database("orders")]
struct Db(sqlx::SqlitePool);

#[get("/count")]
async fn count(mut db: Connection<Db>) -> rocket::serde::json::Json<i64> {
    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM orders")
        .fetch_one(&mut **db).await.unwrap();
    rocket::serde::json::Json(n)
}
// rocket::build().attach(Db::init()).mount("/", routes![count])
// Create the table first (migration run in an AdHoc::try_on_ignite fairing, or sqlx migrations).
```

## Guidelines

- Do not copy 0.4 or release-candidate code: 0.5 is async, uses `Outcome::Error` and `rocket::serde`, and drops `#[macro_use] extern crate rocket_contrib`.
- Never log or compare secrets with `==` on user-controlled strings in production guards; load keys from config or environment and use constant-time comparison.
- With the `secrets` feature (private cookies) set `ROCKET_SECRET_KEY` (for example from `openssl rand -base64 32`) in release builds and keep it stable across restarts, or existing cookies become unreadable.
- `X-Real-IP` is trusted by default for `Request::client_ip()`; only expose Rocket behind a proxy that overwrites it, or change `ip_header` in config.
- Do not hold a `std::sync::Mutex` guard across an `.await`; use `tokio::sync::Mutex` or finish the critical section first.
- An in-memory SQLite URL gives each pooled connection its own database; use a file path.
- Handlers run on tokio: block with `rocket::tokio::task::spawn_blocking` for CPU-heavy or blocking-IO work.
- Rocket does not ship CORS, rate limiting or sessions beyond cookies; add them with a fairing or guard.
