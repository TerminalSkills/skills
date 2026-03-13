---
name: leptos
description: >-
   You are an expert in Leptos, the full-stack Rust web framework that
  combines server-side rendering with client-side interactivity via
  WebAssembly. You help developers build reactive web applications using
  Leptos's fine-grained signal system, server functions, islands architecture,
  and compile-time optimizations — getting React-like DX with Rust's
  performance and type safety.
category: Web Frameworks
tags: [rust, wasm, full-stack, reactive, ssr, signals, isomorphic]
version: 1.0.0
author: terminal-skills
---

# Leptos — Full-Stack Rust Web Framework

You are an expert in Leptos, the full-stack Rust web framework that combines server-side rendering with client-side interactivity via WebAssembly. You help developers build reactive web applications using Leptos's fine-grained signal system, server functions, islands architecture, and compile-time optimizations — getting React-like DX with Rust's performance and type safety.

## Core Capabilities

### Reactive Components

```rust
use leptos::*;

#[component]
fn Counter() -> impl IntoView {
    let (count, set_count) = create_signal(0);

    view! {
        <div class="counter">
            <button on:click=move |_| set_count.update(|n| *n -= 1)>"-"</button>
            <span>{count}</span>
            <button on:click=move |_| set_count.update(|n| *n += 1)>"+"</button>
        </div>
    }
}

#[component]
fn TodoApp() -> impl IntoView {
    let (todos, set_todos) = create_signal(Vec::<String>::new());
    let (input, set_input) = create_signal(String::new());

    let add_todo = move |_| {
        let value = input.get();
        if !value.is_empty() {
            set_todos.update(|t| t.push(value.clone()));
            set_input.set(String::new());
        }
    };

    view! {
        <div>
            <input
                prop:value=input
                on:input=move |ev| set_input.set(event_target_value(&ev))
                on:keydown=move |ev| {
                    if ev.key() == "Enter" { add_todo(ev) }
                }
            />
            <button on:click=add_todo>"Add"</button>
            <ul>
                <For
                    each=move || todos.get().into_iter().enumerate()
                    key=|(i, _)| *i
                    children=move |(_, todo)| view! { <li>{todo}</li> }
                />
            </ul>
        </div>
    }
}
```

### Server Functions

```rust
// Server functions run on the server, callable from client
#[server(GetPosts, "/api")]
pub async fn get_posts(page: u32) -> Result<Vec<Post>, ServerFnError> {
    let db = use_context::<PgPool>().unwrap();
    let posts = sqlx::query_as!(
        Post,
        "SELECT * FROM posts ORDER BY created_at DESC LIMIT 20 OFFSET $1",
        ((page - 1) * 20) as i64,
    )
    .fetch_all(&db)
    .await?;
    Ok(posts)
}

#[server(CreatePost, "/api")]
pub async fn create_post(title: String, body: String) -> Result<Post, ServerFnError> {
    let db = use_context::<PgPool>().unwrap();
    let user = use_context::<AuthUser>().ok_or(ServerFnError::new("Unauthorized"))?;
    let post = sqlx::query_as!(
        Post,
        "INSERT INTO posts (title, body, author_id) VALUES ($1, $2, $3) RETURNING *",
        title, body, user.id,
    )
    .fetch_one(&db)
    .await?;
    Ok(post)
}

// Use in component — works on both server (SSR) and client (WASM)
#[component]
fn PostList() -> impl IntoView {
    let posts = create_resource(|| (), |_| get_posts(1));

    view! {
        <Suspense fallback=move || view! { <p>"Loading..."</p> }>
            {move || posts.get().map(|result| match result {
                Ok(posts) => view! {
                    <ul>
                        {posts.into_iter().map(|p| view! {
                            <li><a href=format!("/posts/{}", p.id)>{&p.title}</a></li>
                        }).collect_view()}
                    </ul>
                }.into_view(),
                Err(e) => view! { <p class="error">{e.to_string()}</p> }.into_view(),
            })}
        </Suspense>
    }
}
```

### SSR + Hydration

```rust
// main.rs — Full-stack setup with Actix
#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let db = PgPool::connect(&env::var("DATABASE_URL").unwrap()).await.unwrap();

    HttpServer::new(move || {
        let leptos_options = get_configuration(None).await.unwrap().leptos_options;
        App::new()
            .app_data(web::Data::new(db.clone()))
            .route("/api/{tail:.*}", leptos_actix::handle_server_fns())
            .leptos_routes(
                leptos_options.clone(),
                generate_route_list(App),
                App,
            )
            .service(Files::new("/", &leptos_options.site_root))
    })
    .bind("0.0.0.0:3000")?
    .run()
    .await
}
```

## Installation

```bash
cargo install cargo-leptos
cargo leptos new --git leptos-rs/start
cd my-app
cargo leptos watch                         # Dev server with hot reload
cargo leptos build --release              # Production build
```

## Best Practices

1. **Fine-grained signals** — Leptos tracks signal dependencies at the expression level; only the exact DOM nodes that depend on a signal update
2. **Server functions** — Use `#[server]` for database queries, auth, file I/O; they compile to API endpoints automatically
3. **Suspense for async** — Wrap async data loading in `<Suspense>`; shows fallback during loading, streams content with SSR
4. **Islands for performance** — Use islands architecture: static HTML with interactive WASM islands; minimal JS shipped
5. **Type-safe routing** — Use `leptos_router` for compile-time checked routes; no runtime 404s from typos
6. **Resource for data fetching** — `create_resource` handles loading states, caching, and refetching automatically
7. **Context for DI** — Use `provide_context` / `use_context` for database pools, auth state, config
8. **WASM size** — Leptos produces small WASM bundles (~200KB gzipped for a full app); fine-grained reactivity means less code shipped
