---
title: Build a High-Performance API in Rust with Axum
slug: build-high-performance-api-in-rust-with-axum
description: Build a production REST API using Axum for the web framework, Tokio for async runtime, and SQLx for compile-time checked database queries — handling 100K concurrent connections on a single $20/month server with sub-millisecond response times and zero garbage collection pauses.
skills: [axum, tokio]
category: Backend Development
tags: [rust, api, high-performance, async, production, backend]
---

# Build a High-Performance API in Rust with Axum

Jun's team runs a real-time bidding platform that processes 50,000 requests per second at peak. Their Node.js API handles it, but with 12 EC2 instances at $200/month each ($2,400/month). The p99 latency spikes to 200ms during GC pauses, causing lost bids. Jun rewrites the hot path in Rust with Axum, targeting 100K req/s on a single server with sub-millisecond p99.

## The Implementation

```rust
// src/main.rs — Production Axum API
use axum::{
    Router, Json,
    extract::{State, Path, Query},
    http::StatusCode,
    routing::{get, post},
    middleware,
};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::time::Duration;
use tower_http::{
    cors::CorsLayer,
    trace::TraceLayer,
    compression::CompressionLayer,
    timeout::TimeoutLayer,
};

#[derive(Clone)]
struct AppState {
    db: PgPool,
    redis: deadpool_redis::Pool,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter("info,sqlx=warn")
        .json()                            // Structured JSON logs
        .init();

    let db = PgPoolOptions::new()
        .max_connections(50)               // Match expected concurrency
        .min_connections(10)               // Keep warm connections
        .acquire_timeout(Duration::from_secs(3))
        .idle_timeout(Duration::from_secs(600))
        .connect(&std::env::var("DATABASE_URL").unwrap())
        .await
        .unwrap();

    sqlx::migrate!("./migrations").run(&db).await.unwrap();

    let redis_cfg = deadpool_redis::Config::from_url(
        std::env::var("REDIS_URL").unwrap()
    );
    let redis = redis_cfg.create_pool(Some(deadpool_redis::Runtime::Tokio1)).unwrap();

    let state = AppState { db, redis };

    let app = Router::new()
        .route("/api/bids", post(place_bid))
        .route("/api/bids/:auction_id", get(get_bids))
        .route("/api/auctions", get(list_auctions).post(create_auction))
        .route("/api/auctions/:id", get(get_auction))
        .route("/health", get(health_check))
        .layer(CompressionLayer::new())
        .layer(TimeoutLayer::new(Duration::from_secs(10)))
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    tracing::info!("Server running on :3000");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c().await.unwrap();
    tracing::info!("Shutting down gracefully...");
}
```

```rust
// src/handlers/bids.rs — Bid placement with Redis caching
#[derive(Deserialize)]
struct PlaceBidRequest {
    auction_id: i64,
    amount: rust_decimal::Decimal,
    bidder_id: i64,
}

#[derive(Serialize)]
struct BidResponse {
    id: i64,
    auction_id: i64,
    amount: rust_decimal::Decimal,
    bidder_id: i64,
    is_winning: bool,
    created_at: chrono::NaiveDateTime,
}

async fn place_bid(
    State(state): State<AppState>,
    Json(req): Json<PlaceBidRequest>,
) -> Result<(StatusCode, Json<BidResponse>), AppError> {
    // Check current highest bid from Redis cache (fast path)
    let cache_key = format!("auction:{}:highest", req.auction_id);
    let mut redis_conn = state.redis.get().await?;
    let cached_highest: Option<String> = redis::cmd("GET")
        .arg(&cache_key)
        .query_async(&mut redis_conn)
        .await?;

    if let Some(highest) = cached_highest {
        let highest: rust_decimal::Decimal = highest.parse()?;
        if req.amount <= highest {
            return Err(AppError::BidTooLow(highest));
        }
    }

    // Insert bid with compile-time checked SQL
    let bid = sqlx::query_as!(
        BidResponse,
        r#"
        WITH inserted AS (
            INSERT INTO bids (auction_id, amount, bidder_id)
            VALUES ($1, $2, $3)
            RETURNING *
        )
        SELECT
            inserted.*,
            (inserted.amount = (
                SELECT MAX(amount) FROM bids WHERE auction_id = $1
            )) as "is_winning!"
        FROM inserted
        "#,
        req.auction_id,
        req.amount,
        req.bidder_id,
    )
    .fetch_one(&state.db)
    .await?;

    // Update Redis cache
    if bid.is_winning {
        redis::cmd("SET")
            .arg(&cache_key)
            .arg(bid.amount.to_string())
            .arg("EX").arg(300)            // 5 min TTL
            .query_async::<()>(&mut redis_conn)
            .await?;
    }

    Ok((StatusCode::CREATED, Json(bid)))
}
```

## Results

Jun deploys on a single $20/month Hetzner server (4 vCPU, 8GB RAM).

- **Throughput**: 127,000 req/s (single server) vs 50,000 req/s (12 Node.js servers)
- **p99 latency**: 0.8ms vs 200ms (no GC pauses)
- **Memory usage**: 45MB RSS vs 2.1GB per Node.js instance
- **Infrastructure cost**: $20/month vs $2,400/month (99.2% reduction)
- **Binary size**: 12MB static binary, no runtime dependencies
- **Cold start**: 15ms (instant, no JIT warmup)
