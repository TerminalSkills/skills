---
name: chi
description: >-
  Chi is a lightweight Go HTTP router built on net/http, with composable
  middleware, route groups, URL parameters and sub-routers. Use when building
  a REST API or web service in Go, adding middleware (logging, timeouts, auth,
  CORS, client IP), nesting routes under /api, loading a resource into the
  request context, or migrating from gorilla/mux or the standard ServeMux.
license: Apache-2.0
compatibility: "Go 1.24+ (chi v5.5 declares go 1.24 in go.mod); module github.com/go-chi/chi/v5"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/go-chi/chi
  tags: "go, router, http, middleware, rest-api"
---

# Chi - Lightweight Go HTTP Router

## Overview

Chi (`github.com/go-chi/chi/v5`, current release v5.5.0) is a small router that keeps the standard library's `http.Handler` and `http.HandlerFunc` types, so any `net/http` middleware works unchanged. It adds method routing (`r.Get`, `r.Post`), URL parameters (`/{userID}`, regexp `/{slug:[a-z-]+}`), nested routes with scoped middleware (`r.Route`, `r.Group`, `r.With`) and mounted sub-routers (`r.Mount`). It has no dependencies beyond the standard library. CORS lives in a separate module, `github.com/go-chi/cors`.

## Instructions

1. Install: `go get github.com/go-chi/chi/v5` (add `github.com/go-chi/cors` only if a browser calls the API from another origin). The import path always ends in `/v5`.
2. Create the router with `chi.NewRouter()` and register middleware with `r.Use(...)` before any route; chi panics if `Use` is called after routes exist on the same router.
3. Put the middleware in this order: `RequestID`, a client-IP middleware, `Logger`, `Recoverer`, `Timeout`, then CORS and auth.
4. Get the client IP with exactly one of the `ClientIPFrom*` middlewares and read it with `middleware.GetClientIP(ctx)`. Do not use `middleware.RealIP`: v5.5 marks it deprecated because it trusts spoofable headers and rewrites `r.RemoteAddr`.

   | Deployment | Middleware |
   |---|---|
   | Server is directly on the internet | `middleware.ClientIPFromRemoteAddr` |
   | Behind nginx, Cloudflare or another proxy that always overwrites one header | `middleware.ClientIPFromHeader("CF-Connecting-IP")` |
   | Behind proxies whose address ranges you know | `middleware.ClientIPFromXFF("10.0.0.0/8")` |
   | Fixed number of proxies with changing addresses | `middleware.ClientIPFromXFFTrustedProxies(2)` |

5. Group routes with `r.Route("/api", func(r chi.Router) {...})`; middleware added inside applies only to that subtree. Use `r.Group(func(r chi.Router) {...})` for middleware without a path prefix, and `r.With(mw).Get(...)` for a single route.
6. Read parameters with `chi.URLParam(r, "userID")`. To load a resource once for several routes, write a middleware that looks it up, stores it with `context.WithValue` under a private key type, and attach it with `r.Use` inside the `/{userID}` route.
7. `middleware.Timeout(d)` only cancels the request context and answers 504; handlers and database calls must watch `r.Context()` for it to take effect.
8. Mount independent routers with `r.Mount("/admin", adminRouter())`. Customise 404 and 405 with `r.NotFound(h)` and `r.MethodNotAllowed(h)`.
9. Test handlers without a network: call `router.ServeHTTP(rec, req)` with `httptest.NewRecorder()`.

## Examples

### Example 1: A small users API with auth and a context loader

**User request:** "Set up a chi API with a health check, a protected /api/users group, and a middleware that loads the user once per request."

This `main.go` was compiled and tested with Go 1.27.3 and chi v5.5.0 (`go mod init shopwave && go get github.com/go-chi/chi/v5 github.com/go-chi/cors`).

```go
package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

type User struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

type store struct {
	mu    sync.RWMutex
	users map[int]User
	next  int
}

func (s *store) find(id int) (User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.users[id]
	if !ok {
		return User{}, errors.New("not found")
	}
	return u, nil
}

func (s *store) add(u User) User {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.next++
	u.ID = s.next
	s.users[u.ID] = u
	return u
}

type ctxKey string

const userKey ctxKey = "user"

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func newRouter(db *store, apiKey string) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.ClientIPFromRemoteAddr) // direct exposure; behind a proxy pick another ClientIPFrom*
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"https://app.shopwave.io"},
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE"},
		AllowedHeaders: []string{"Authorization", "Content-Type"},
		MaxAge:         300,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "client": middleware.GetClientIP(r.Context())})
	})

	r.Route("/api", func(r chi.Router) {
		r.Use(requireKey(apiKey))
		r.Route("/users", func(r chi.Router) {
			r.Post("/", func(w http.ResponseWriter, r *http.Request) {
				var in User
				if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&in); err != nil || in.Email == "" {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name and email are required"})
					return
				}
				writeJSON(w, http.StatusCreated, db.add(in))
			})
			r.Route("/{userID}", func(r chi.Router) {
				r.Use(userCtx(db))
				r.Get("/", func(w http.ResponseWriter, r *http.Request) {
					writeJSON(w, http.StatusOK, r.Context().Value(userKey).(User))
				})
			})
		})
	})
	return r
}

func requireKey(want string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			got := r.Header.Get("Authorization")
			if subtle.ConstantTimeCompare([]byte(got), []byte("Bearer "+want)) != 1 {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func userCtx(db *store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id, err := strconv.Atoi(chi.URLParam(r, "userID"))
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bad id"})
				return
			}
			u, err := db.find(id)
			if err != nil {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "user not found"})
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userKey, u)))
		})
	}
}

func main() {
	key := os.Getenv("API_KEY")
	if key == "" {
		log.Fatal("API_KEY is not set")
	}
	db := &store{users: map[int]User{}}
	srv := &http.Server{
		Addr:              "127.0.0.1:3000",
		Handler:           newRouter(db, key),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Fatal(srv.ListenAndServe())
}
```

```console
$ API_KEY=shopwave-dev-key go run .
$ curl -s localhost:3000/health
{"client":"127.0.0.1","status":"ok"}
$ curl -s -X POST localhost:3000/api/users -H 'Authorization: Bearer shopwave-dev-key' -d '{"name":"Ada","email":"ada@shopwave.io"}'
{"id":1,"name":"Ada","email":"ada@shopwave.io"}
$ curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/users/1
401
```

### Example 2: Test the router without starting a server

**User request:** "Add a test for the users routes."

Save as `main_test.go` next to the file above and run `go test ./...`; it prints `ok  shopwave`.

```go
package main

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestUsers(t *testing.T) {
	srv := newRouter(&store{users: map[int]User{}}, "shopwave-dev-key")
	do := func(method, path, body, auth string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", auth)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		return rec
	}
	if c := do("GET", "/api/users/1", "", "").Code; c != 401 {
		t.Fatalf("want 401, got %d", c)
	}
	auth := "Bearer shopwave-dev-key"
	if c := do("POST", "/api/users", `{"name":"Ada","email":"ada@shopwave.io"}`, auth).Code; c != 201 {
		t.Fatalf("want 201, got %d", c)
	}
	if c := do("GET", "/api/users/1", "", auth).Code; c != 200 {
		t.Fatalf("want 200, got %d", c)
	}
	if c := do("GET", "/api/users/9", "", auth).Code; c != 404 {
		t.Fatalf("want 404, got %d", c)
	}
}
```

## Guidelines

- Handlers are plain `http.HandlerFunc`; use the standard library for JSON, validation and errors. Chi does no binding or dependency injection. `github.com/go-chi/render` has JSON helpers if you want them.
- Never trust `X-Forwarded-For` or `X-Real-IP` directly; choose the `ClientIPFrom*` variant that matches your proxy and verify it with a request from a known address.
- Keys for `context.WithValue` must be a private named type (like `ctxKey` above), not a string.
- Set `ReadHeaderTimeout` on `http.Server`; `http.ListenAndServe` has no timeouts. Bind to `127.0.0.1` unless the service must be reachable from outside.
- List `AllowedOrigins` explicitly; do not combine `"*"` with `AllowCredentials: true`.
- Compare secrets with `subtle.ConstantTimeCompare` and load them from the environment.
- `/{articleID}` matches one path segment; use `/*` as a catch-all and read it with `chi.URLParam(r, "*")`.
