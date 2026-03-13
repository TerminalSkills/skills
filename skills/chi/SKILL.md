---
name: chi
description: >-
   You are an expert in Chi, the lightweight, idiomatic Go HTTP router built
  on `net/http`. You help developers build composable HTTP services using
  Chi's middleware stack, route groups, URL parameters, sub-routers, and
  context-based request scoping — providing Express-like ergonomics while
  staying 100% compatible with Go's standard library.
category: Backend Development
tags: [go, router, http, middleware, lightweight, stdlib-compatible]
version: 1.0.0
author: terminal-skills
---

# Chi — Lightweight Go HTTP Router

You are an expert in Chi, the lightweight, idiomatic Go HTTP router built on `net/http`. You help developers build composable HTTP services using Chi's middleware stack, route groups, URL parameters, sub-routers, and context-based request scoping — providing Express-like ergonomics while staying 100% compatible with Go's standard library.

## Core Capabilities

### Router and Routes

```go
package main

import (
    "encoding/json"
    "net/http"
    "github.com/go-chi/chi/v5"
    "github.com/go-chi/chi/v5/middleware"
    "github.com/go-chi/cors"
)

func main() {
    r := chi.NewRouter()

    // Built-in middleware
    r.Use(middleware.Logger)
    r.Use(middleware.Recoverer)
    r.Use(middleware.RequestID)
    r.Use(middleware.RealIP)
    r.Use(middleware.Timeout(30 * time.Second))
    r.Use(cors.Handler(cors.Options{
        AllowedOrigins: []string{"https://app.example.com"},
        AllowedMethods: []string{"GET", "POST", "PUT", "DELETE"},
    }))

    // Public routes
    r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
        json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
    })

    // Protected routes
    r.Route("/api", func(r chi.Router) {
        r.Use(authMiddleware)

        r.Route("/users", func(r chi.Router) {
            r.Get("/", listUsers)
            r.Post("/", createUser)

            r.Route("/{userID}", func(r chi.Router) {
                r.Use(userCtx)            // Load user into context
                r.Get("/", getUser)
                r.Put("/", updateUser)
                r.Delete("/", deleteUser)
                r.Get("/posts", getUserPosts)
            })
        })
    })

    http.ListenAndServe(":3000", r)
}

// Context middleware — load resource once, use in all sub-routes
func userCtx(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        userID := chi.URLParam(r, "userID")
        user, err := db.FindUser(userID)
        if err != nil {
            http.Error(w, "user not found", 404)
            return
        }
        ctx := context.WithValue(r.Context(), "user", user)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}

func getUser(w http.ResponseWriter, r *http.Request) {
    user := r.Context().Value("user").(*User)
    json.NewEncoder(w).Encode(user)
}

func listUsers(w http.ResponseWriter, r *http.Request) {
    page := r.URL.Query().Get("page")
    users, _ := db.ListUsers(page)
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(users)
}
```

## Installation

```bash
go get -u github.com/go-chi/chi/v5
```

## Best Practices

1. **stdlib compatible** — Chi handlers are `http.HandlerFunc`; use any `net/http` middleware without adapters
2. **Route groups** — Use `r.Route("/prefix", func(r chi.Router) {...})` for scoped middleware and routes
3. **Context middleware** — Load resources in middleware, share via `context.WithValue`; DRY across sub-routes
4. **URL params** — Use `chi.URLParam(r, "id")` to extract route parameters; type-safe, explicit
5. **Middleware ordering** — Logger first, Recoverer second; auth before route-specific middleware
6. **Sub-routers** — Mount independent routers: `r.Mount("/admin", adminRouter())`; clean separation
7. **Timeouts** — Use `middleware.Timeout` to prevent slow handlers from blocking; returns 504 on timeout
8. **No magic** — Chi doesn't do dependency injection or auto-binding; explicit is better than implicit in Go
