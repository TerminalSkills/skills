---
name: tokio
description: >-
  Tokio is the asynchronous runtime for Rust: a task scheduler, async TCP/UDP,
  timers, channels and synchronization primitives that most async Rust crates
  (axum, hyper, reqwest, tonic) run on. Use it when asked to write async Rust,
  spawn concurrent tasks, build a TCP server, use mpsc or broadcast channels,
  add timeouts, limit concurrency with a semaphore, run blocking code from
  async code, or shut a Tokio service down gracefully.
license: Apache-2.0
compatibility: 'Rust 1.85+ (Tokio 1.54); Tokio 1.51.x and 1.53.x are LTS releases with MSRV 1.71'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/tokio-rs/tokio
  category: development
  tags:
    - rust
    - async
    - runtime
    - concurrency
    - networking
---

# Tokio — Async Runtime for Rust

## Overview

Tokio runs `async` Rust code. `#[tokio::main]` starts a multi-threaded scheduler, `tokio::spawn` runs futures as lightweight tasks, and the `net`, `time`, `sync`, `io`, `fs`, `process` and `signal` modules provide async versions of the std building blocks. The current release is 1.54.1 (2026-10-21, MSRV 1.85). Tokio keeps a rolling MSRV of at least six months and designates some minor versions as LTS (1.51.x until March 2027, 1.53.x until September 2027); pin to an LTS line, for example `version = "~1.53"`, if you cannot raise your Rust version often.

## Instructions

### Install

```toml
# Cargo.toml
[dependencies]
tokio = { version = "1", features = ["rt-multi-thread", "macros", "net", "io-util", "time", "sync", "signal"] }
tokio-util = { version = "0.7", features = ["rt"] }   # CancellationToken; the "rt" feature adds TaskTracker
```

`features = ["full"]` turns everything on and is fine for applications; libraries should enable only what they use. Without `macros` and `rt-multi-thread`, `#[tokio::main]` does not compile.

### Tasks, join, select, blocking work

```rust
use tokio::time::{sleep, timeout, Duration};

fn checksum_all(files: Vec<String>) -> u64 {
    files.iter().map(|f| f.len() as u64).sum() // stands in for CPU-heavy work
}

#[tokio::main]
async fn main() {
    let a = tokio::spawn(async {
        sleep(Duration::from_secs(1)).await;
        "invoice sync done"
    });
    let b = tokio::spawn(async {
        sleep(Duration::from_millis(500)).await;
        "cache warm done"
    });
    // join! waits for both; each JoinHandle yields Result<T, JoinError>
    let (ra, rb) = tokio::join!(a, b);
    println!("{}, {}", ra.unwrap(), rb.unwrap());

    // select! runs both branches until one finishes, then drops the other
    tokio::select! {
        _ = sleep(Duration::from_secs(1)) => println!("slow path"),
        _ = sleep(Duration::from_millis(100)) => println!("fast path"),
    }

    // timeout wraps any future; Err(Elapsed) if it does not finish in time
    match timeout(Duration::from_millis(200), sleep(Duration::from_secs(5))).await {
        Ok(_) => println!("finished"),
        Err(_) => println!("timed out after 200ms"),
    }

    // CPU-heavy or blocking std code goes to the blocking pool
    let total = tokio::task::spawn_blocking(|| checksum_all(vec!["a.log".into(), "b.log".into()]))
        .await
        .unwrap();
    println!("{total}");
}
```

Futures are lazy: nothing runs until awaited or spawned. A spawned task must be `Send + 'static`, so move owned data into it (`async move`).

### Channels

```rust
use tokio::sync::{broadcast, mpsc, oneshot, watch};

#[tokio::main]
async fn main() {
    // mpsc: many producers, one consumer; bounded, so send().await applies backpressure
    let (tx, mut rx) = mpsc::channel::<String>(100);
    for id in 0..3 {
        let tx = tx.clone();
        tokio::spawn(async move { tx.send(format!("worker {id} ready")).await.unwrap(); });
    }
    drop(tx); // recv() returns None only after every sender is dropped
    while let Some(msg) = rx.recv().await {
        println!("{msg}");
    }

    // oneshot: one value, one reply (request/response)
    let (reply_tx, reply_rx) = oneshot::channel::<u32>();
    tokio::spawn(async move { let _ = reply_tx.send(42); });
    println!("answer {}", reply_rx.await.unwrap());

    // broadcast: every receiver sees every message; slow receivers get RecvError::Lagged
    let (btx, mut brx1) = broadcast::channel::<String>(16);
    let mut brx2 = btx.subscribe();
    btx.send("deploy started".into()).unwrap();
    println!("{} / {}", brx1.recv().await.unwrap(), brx2.recv().await.unwrap());

    // watch: latest value only, for config or state that changes
    let (wtx, mut wrx) = watch::channel(String::from("v1"));
    wtx.send("v2".into()).unwrap();
    wrx.changed().await.unwrap();
    println!("config now {}", *wrx.borrow());
}
```

### TCP echo server with graceful shutdown

```rust
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;
use tokio_util::task::TaskTracker;

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let listener = TcpListener::bind("127.0.0.1:8080").await?;
    let token = CancellationToken::new();
    let tracker = TaskTracker::new();

    let shutdown = token.clone();
    tokio::spawn(async move {
        tokio::signal::ctrl_c().await.expect("failed to listen for ctrl-c");
        shutdown.cancel();
    });

    loop {
        tokio::select! {
            _ = token.cancelled() => break,
            accepted = listener.accept() => {
                let (mut socket, addr) = accepted?;
                println!("connection from {addr}");
                let conn_token = token.clone();
                tracker.spawn(async move {
                    let mut buf = [0u8; 1024];
                    loop {
                        tokio::select! {
                            _ = conn_token.cancelled() => return,
                            read = socket.read(&mut buf) => match read {
                                Ok(0) | Err(_) => return,
                                Ok(n) => if socket.write_all(&buf[..n]).await.is_err() { return },
                            },
                        }
                    }
                });
            }
        }
    }

    tracker.close();
    tracker.wait().await; // let in-flight connections finish
    Ok(())
}
```

### Shared state and concurrency limits

```rust
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock, Semaphore};

#[tokio::main]
async fn main() {
    let queue = Arc::new(Mutex::new(vec![1, 2, 3]));
    let q = queue.clone();
    tokio::spawn(async move { q.lock().await.push(4); }).await.unwrap();

    let cache: Arc<RwLock<HashMap<String, String>>> = Arc::new(RwLock::new(HashMap::new()));
    cache.write().await.insert("region".into(), "eu-west-1".into());
    println!("{:?}", cache.read().await.get("region"));

    // At most 10 requests in flight
    let limit = Arc::new(Semaphore::new(10));
    let mut jobs = Vec::new();
    for page in 0..50 {
        let permit = limit.clone().acquire_owned().await.unwrap();
        jobs.push(tokio::spawn(async move {
            let _permit = permit; // released when the task ends
            page * 2             // stands in for an HTTP request
        }));
    }
    for j in jobs { j.await.unwrap(); }
}
```

## Examples

### Example 1: "Fetch 200 URLs but only 20 at a time"

Use a `Semaphore::new(20)`, acquire an owned permit before each `tokio::spawn`, move the permit into the task, and `await` the collected `JoinHandle`s as in the semaphore block above. Memory stays flat because the loop waits for a permit before creating the next task.

### Example 2: "My async handler freezes the whole server"

A call such as `std::thread::sleep`, `std::fs::read_to_string` on a large file or a heavy loop inside an async fn blocks a worker thread. Replace it with `tokio::time::sleep`, `tokio::fs`, or wrap it in `tokio::task::spawn_blocking(|| ...)` and `.await` the handle. A symptom is timers firing late and unrelated requests stalling.

## Guidelines

- Never hold a `std::sync::Mutex` guard across an `.await` (the future stops being `Send`); either release it before awaiting or use `tokio::sync::Mutex`. For short critical sections without awaits, the std mutex is faster.
- Dropping a `JoinHandle` detaches the task; it does not cancel it. Use `abort()` or a `CancellationToken` to stop work.
- `select!` drops the losing futures at their last `.await`; a branch holding partially-completed work (a half-written buffer) is not cancellation-safe. The docs of each method state whether it is cancel safe.
- Prefer bounded `mpsc::channel`; `unbounded_channel` lets a slow consumer grow memory without limit.
- Bind servers to `127.0.0.1` unless they must be reachable from other hosts.
- Tracing spans do not follow `tokio::spawn` automatically: attach them with `.instrument(span)` from the `tracing` crate.
- Do not create a second runtime inside async code; calling `block_on` from within a runtime panics. Use `spawn_blocking` or `Handle::current()` instead.
