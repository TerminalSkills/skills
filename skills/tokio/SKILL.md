---
name: tokio
description: >-
   You are an expert in Tokio, the asynchronous runtime for Rust that powers
  most of the Rust async ecosystem. You help developers build high-performance
  network applications, concurrent services, and I/O-bound systems using
  Tokio's task scheduler, async I/O primitives, channels, timers, and
  synchronization utilities — handling millions of concurrent connections with
  minimal memory overhead.
category: Backend Development
tags: [rust, async, runtime, concurrency, networking, performance]
version: 1.0.0
author: terminal-skills
---

# Tokio — Async Runtime for Rust

You are an expert in Tokio, the asynchronous runtime for Rust that powers most of the Rust async ecosystem. You help developers build high-performance network applications, concurrent services, and I/O-bound systems using Tokio's task scheduler, async I/O primitives, channels, timers, and synchronization utilities — handling millions of concurrent connections with minimal memory overhead.

## Core Capabilities

### Async Tasks

```rust
use tokio::time::{sleep, Duration};
use tokio::task;

#[tokio::main]
async fn main() {
    // Spawn concurrent tasks
    let handle1 = task::spawn(async {
        sleep(Duration::from_secs(1)).await;
        "Task 1 done"
    });

    let handle2 = task::spawn(async {
        sleep(Duration::from_millis(500)).await;
        "Task 2 done"
    });

    // Await both
    let (r1, r2) = tokio::join!(handle1, handle2);
    println!("{}, {}", r1.unwrap(), r2.unwrap());

    // Select first to complete
    tokio::select! {
        val = async { sleep(Duration::from_secs(1)).await; "slow" } => {
            println!("Got: {val}");
        }
        val = async { sleep(Duration::from_millis(100)).await; "fast" } => {
            println!("Got: {val}");
        }
    }

    // Spawn blocking work (CPU-intensive) on dedicated thread pool
    let result = task::spawn_blocking(|| {
        heavy_computation()                // Won't block async runtime
    }).await.unwrap();
}
```

### Channels

```rust
use tokio::sync::{mpsc, broadcast, oneshot, watch};

// mpsc: Multiple producers, single consumer
let (tx, mut rx) = mpsc::channel::<String>(100);  // Buffer size 100
let tx2 = tx.clone();

task::spawn(async move { tx.send("hello".into()).await.unwrap(); });
task::spawn(async move { tx2.send("world".into()).await.unwrap(); });

while let Some(msg) = rx.recv().await {
    println!("Got: {msg}");
}

// broadcast: Multiple producers, multiple consumers
let (tx, _) = broadcast::channel::<String>(100);
let mut rx1 = tx.subscribe();
let mut rx2 = tx.subscribe();
tx.send("event".into()).unwrap();
// Both rx1 and rx2 receive "event"

// oneshot: Single value, single use (request-response)
let (tx, rx) = oneshot::channel::<String>();
tx.send("response".into()).unwrap();
let val = rx.await.unwrap();

// watch: Single value that can be updated and observed
let (tx, mut rx) = watch::channel("initial".to_string());
tx.send("updated".into()).unwrap();
rx.changed().await.unwrap();
```

### TCP Server

```rust
use tokio::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let listener = TcpListener::bind("0.0.0.0:8080").await?;

    loop {
        let (mut socket, addr) = listener.accept().await?;
        println!("New connection from {addr}");

        tokio::spawn(async move {
            let mut buf = vec![0u8; 1024];
            loop {
                let n = match socket.read(&mut buf).await {
                    Ok(0) => return,       // Connection closed
                    Ok(n) => n,
                    Err(e) => { eprintln!("Read error: {e}"); return; }
                };
                if socket.write_all(&buf[..n]).await.is_err() {
                    return;                // Write error
                }
            }
        });
    }
}
```

### Synchronization

```rust
use tokio::sync::{Mutex, RwLock, Semaphore};
use std::sync::Arc;

// Async Mutex (yields while waiting, doesn't block thread)
let data = Arc::new(Mutex::new(vec![1, 2, 3]));
let data_clone = data.clone();
tokio::spawn(async move {
    let mut lock = data_clone.lock().await;
    lock.push(4);
});

// RwLock: Multiple readers OR single writer
let cache = Arc::new(RwLock::new(HashMap::new()));
let read = cache.read().await;             // Non-exclusive
let mut write = cache.write().await;       // Exclusive

// Semaphore: Limit concurrency
let semaphore = Arc::new(Semaphore::new(10));  // Max 10 concurrent
let permit = semaphore.acquire().await.unwrap();
// ... do work ...
drop(permit);                              // Release
```

## Installation

```toml
[dependencies]
tokio = { version = "1", features = ["full"] }
# Or selectively: features = ["rt-multi-thread", "macros", "net", "io-util", "time", "sync"]
```

## Best Practices

1. **Don't block the runtime** — Use `spawn_blocking` for CPU-intensive or synchronous I/O; blocking async threads starves other tasks
2. **Use channels for communication** — mpsc for work queues, broadcast for events, watch for config updates
3. **Select for racing** — `tokio::select!` picks the first future to complete; great for timeouts and cancellation
4. **Async Mutex vs std Mutex** — Use `tokio::sync::Mutex` when holding lock across `.await`; std Mutex for short, sync-only locks
5. **Semaphores for backpressure** — Limit concurrent database queries, HTTP requests, or file operations
6. **Graceful shutdown** — Use `tokio::signal::ctrl_c()` + cancellation tokens to drain work before exiting
7. **Runtime configuration** — Use `#[tokio::main]` for defaults; `runtime::Builder` for custom thread counts and stack sizes
8. **Tracing integration** — Use `tracing` crate with Tokio; spans propagate across async task boundaries automatically
