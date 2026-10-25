---
name: go-fiber
description: >-
  Fiber is an Express.js-inspired web framework for Go built on Fasthttp. Use
  it when a user asks to "build a REST API in Go with Fiber", "add middleware
  or rate limiting to a Fiber app", "bind and validate JSON in Fiber",
  "migrate Fiber v2 to v3", or "structure routes with groups". Covers setup,
  handlers, request binding, middleware, error handling and graceful shutdown
  on Fiber v3, with the v2 differences called out.
license: Apache-2.0
compatibility: "Go 1.26+ for Fiber v3 (v3.6.1); Fiber v2 (v2.52.x) still receives fixes"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/gofiber/fiber
  tags: "go, fiber, rest-api, middleware, fasthttp"
---

# Fiber

## Overview

Fiber gives Go developers an Express-style API (`app.Get`, `c.Params`, `c.JSON`, `c.Next`) on top of Fasthttp instead of `net/http`. The current major version is v3 (module `github.com/gofiber/fiber/v3`, requires Go 1.26 or newer); v2 (`/v2`) is the previous line. The two are not source compatible: v3 handlers take `fiber.Ctx` (an interface) instead of `*fiber.Ctx`, and body parsing moved to `c.Bind()`.

Because Fasthttp reuses request objects, never keep `c`, or strings and byte slices read from it, after the handler returns (for example in a goroutine) without copying them. Copy values first (for example with `strings.Clone`) or set `Immutable: true` in `fiber.Config`.

## Instructions

### Step 1: Create the module

```bash
mkdir shopfront-api && cd shopfront-api
go mod init shopfront-api
go get github.com/gofiber/fiber/v3
```

### Step 2: Server, handlers, middleware

This is a complete `main.go`: an in-memory users API with a bearer-token group, a rate limiter, request validation, a central error handler and graceful shutdown. It was built and exercised against v3.6.1.

```go
package main

import (
	"context"
	"crypto/subtle"
	"errors"
	"log"
	"net/mail"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/limiter"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"
)

type User struct {
	ID        int       `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}

type CreateUserRequest struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

var (
	mu     sync.Mutex
	users  = []User{}
	nextID = 1
)

func errorHandler(c fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	var fe *fiber.Error
	if errors.As(err, &fe) {
		code = fe.Code
	}
	return c.Status(code).JSON(fiber.Map{"error": err.Error()})
}

func createUser(c fiber.Ctx) error {
	var req CreateUserRequest
	if err := c.Bind().JSON(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}
	if len(strings.TrimSpace(req.Name)) < 2 {
		return fiber.NewError(fiber.StatusUnprocessableEntity, "name must be at least 2 characters")
	}
	if _, err := mail.ParseAddress(req.Email); err != nil {
		return fiber.NewError(fiber.StatusUnprocessableEntity, "email is not valid")
	}
	mu.Lock()
	defer mu.Unlock()
	u := User{ID: nextID, Name: req.Name, Email: req.Email, CreatedAt: time.Now()}
	nextID++
	users = append(users, u)
	return c.Status(fiber.StatusCreated).JSON(u)
}

func getUser(c fiber.Ctx) error {
	id, err := strconv.Atoi(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "id must be a number")
	}
	mu.Lock()
	defer mu.Unlock()
	for _, u := range users {
		if u.ID == id {
			return c.JSON(u)
		}
	}
	return fiber.NewError(fiber.StatusNotFound, "user not found")
}

func listUsers(c fiber.Ctx) error {
	page := max(fiber.Query[int](c, "page", 1), 1)
	perPage := min(max(fiber.Query[int](c, "per_page", 20), 1), 100)
	mu.Lock()
	defer mu.Unlock()
	start := min((page-1)*perPage, len(users))
	end := min(start+perPage, len(users))
	return c.JSON(fiber.Map{"data": users[start:end], "total": len(users), "page": page})
}

func authMiddleware(c fiber.Ctx) error {
	token := strings.TrimPrefix(c.Get(fiber.HeaderAuthorization), "Bearer ")
	want := os.Getenv("API_TOKEN")
	if want == "" || subtle.ConstantTimeCompare([]byte(token), []byte(want)) != 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "missing or invalid token")
	}
	c.Locals("user_id", 42)
	return c.Next()
}

func main() {
	app := fiber.New(fiber.Config{ErrorHandler: errorHandler, BodyLimit: 4 * 1024 * 1024})
	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{AllowOrigins: []string{"https://app.shopfront.dev"}}))
	app.Use(limiter.New(limiter.Config{Max: 100, Expiration: time.Minute}))

	app.Get("/health", func(c fiber.Ctx) error { return c.JSON(fiber.Map{"status": "ok"}) })
	api := app.Group("/api/v1", authMiddleware)
	api.Get("/users", listUsers)
	api.Get("/users/:id", getUser)
	api.Post("/users", createUser)
	api.Get("/me", func(c fiber.Ctx) error { return c.JSON(fiber.Map{"user_id": c.Locals("user_id")}) })

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	log.Fatal(app.Listen("127.0.0.1:3111", fiber.ListenConfig{GracefulContext: ctx, ShutdownTimeout: 10 * time.Second}))
}
```

Notes on the code:

- `c.Bind().JSON(&req)` binds a JSON body; `c.Bind().Body(&req)` picks the decoder from the Content-Type; `c.Bind().Query(&q)` and `c.Bind().URI(&p)` bind query strings and path parameters into tagged structs (`query:"page"`, `uri:"id"`).
- `fiber.Query[int](c, "page", 1)` reads a typed query value with a default; `fiber.Params[int](c, "id")` does the same for path parameters.
- Return `fiber.NewError(status, message)` and let `ErrorHandler` render it; a plain `error` becomes a 500.
- `limiter.Config.Expiration` is a `time.Duration`; `Expiration: 60` would mean 60 nanoseconds.
- Run it with `API_TOKEN=... go run .`; `GracefulContext` stops the server and drains connections on Ctrl-C or SIGTERM.

### Step 3: Migrating from v2

| v2 | v3 |
| --- | --- |
| `github.com/gofiber/fiber/v2` | `github.com/gofiber/fiber/v3` |
| `func(c *fiber.Ctx) error` | `func(c fiber.Ctx) error` |
| `c.BodyParser(&x)` | `c.Bind().Body(&x)` |
| `c.QueryInt("page", 1)` | `fiber.Query[int](c, "page", 1)` |
| `fiber.Config{Prefork: true}` | `fiber.Config{EnablePrefork: true}` |
| `app.Listen(":3000")` with options on `Config` | `app.Listen(":3000", fiber.ListenConfig{...})` |
| `cors.Config{AllowOrigins: "a,b"}` | `cors.Config{AllowOrigins: []string{"a", "b"}}` |

The full list is in the project's `docs/whats_new.md`. Run `go vet ./...` after migrating; most mismatches are compile errors.

## Examples

### Example 1: Create and read a user

Request: "Add a POST /api/v1/users endpoint that validates name and email and returns 201."

```console
$ API_TOKEN=local-dev-token go run . &
$ curl -s -H "Authorization: Bearer local-dev-token" -H "Content-Type: application/json" \
    -d '{"name":"Maya Lindqvist","email":"maya@shopfront.dev"}' http://127.0.0.1:3111/api/v1/users
{"id":1,"name":"Maya Lindqvist","email":"maya@shopfront.dev","created_at":"2026-10-24T20:52:08+02:00"}
$ curl -s -H "Authorization: Bearer local-dev-token" http://127.0.0.1:3111/api/v1/users/9
{"error":"user not found"}
```

An invalid body (`{"name":"M","email":"x"}`) returns 422 with `{"error":"name must be at least 2 characters"}`, and a request without the token returns 401.

### Example 2: Test a handler without a server

Request: "Write a test for /health."

```go
func TestHealth(t *testing.T) {
	app := fiber.New()
	app.Get("/health", func(c fiber.Ctx) error { return c.JSON(fiber.Map{"status": "ok"}) })

	resp, err := app.Test(httptest.NewRequest("GET", "/health", nil))
	if err != nil || resp.StatusCode != 200 {
		t.Fatalf("status %v err %v", resp.StatusCode, err)
	}
}
```

`app.Test` drives the router in memory, so no port is opened.

## Guidelines

- Pick v3 for new projects; keep v2 only for existing code you are not ready to migrate.
- Group routes with `app.Group("/api/v1", authMiddleware)` so middleware only covers the routes that need it.
- Pass request-scoped data between middleware and handlers with `c.Locals`.
- Set `EnablePrefork: true` only when you have measured a gain and are not keeping state in memory: each child process has its own memory, so the in-memory store above and the limiter's default storage are per process.
- Bind to `127.0.0.1` for local work; listen on all interfaces only behind a reverse proxy you control.
- Restrict `cors.Config.AllowOrigins` to the origins you serve; the default allows all.
- Add a validator package (for example `github.com/go-playground/validator/v10`) when rules outgrow hand-written checks.
