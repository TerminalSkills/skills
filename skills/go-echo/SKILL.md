---
name: go-echo
description: >-
  Echo is a minimalist, high-performance Go web framework for REST APIs, with a fast router,
  route groups, middleware, request binding and validation, and centralized error handling.
  Use when asked to build a Go API with Echo, add JWT auth, CORS, rate limiting or request
  logging to an Echo app, bind and validate JSON, or migrate Echo v4 code to v5.
license: Apache-2.0
compatibility: "Go 1.25+ for Echo v5 (v4 supports older Go)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/labstack/echo
  tags:
    - go
    - web-framework
    - api
    - middleware
    - rest
---

# Echo — High-Performance Go Web Framework

## Overview

Echo is a Go web framework built on `net/http`: a radix-tree router, route groups, middleware at global, group or route level, data binding for JSON, XML, form, query and path parameters, pluggable validation, and centralized error handling. `v5` is the current major version (released January 2026, `github.com/labstack/echo/v5`, requires Go 1.25). `v4` gets security fixes until 2026-12-31. The two differ in the handler signature, so check `go.mod` before writing code.

## Instructions

### Install

```console
$ go mod init shopapi
$ go get github.com/labstack/echo/v5 github.com/labstack/echo-jwt/v5 github.com/go-playground/validator/v10
```

### v5 application

The complete program below was built and exercised with curl (JWT check, create, validate, 404, graceful shutdown on Ctrl+C).

```go
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/golang-jwt/jwt/v5"
	echojwt "github.com/labstack/echo-jwt/v5"
	"github.com/labstack/echo/v5"
	"github.com/labstack/echo/v5/middleware"
)

type User struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
	Age   int    `json:"age"`
}

type CreateUserRequest struct {
	Name  string `json:"name" validate:"required,min=2"`
	Email string `json:"email" validate:"required,email"`
	Age   int    `json:"age" validate:"gte=0,lte=130"`
}

// CustomValidator adapts go-playground/validator to echo.Validator.
type CustomValidator struct{ v *validator.Validate }

func (cv *CustomValidator) Validate(i any) error {
	if err := cv.v.Struct(i); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	return nil
}

type store struct {
	mu    sync.Mutex
	users []User
}

func (s *store) create(r CreateUserRequest) User {
	s.mu.Lock()
	defer s.mu.Unlock()
	u := User{ID: len(s.users) + 1, Name: r.Name, Email: r.Email, Age: r.Age}
	s.users = append(s.users, u)
	return u
}

func (s *store) find(id int) (User, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, u := range s.users {
		if u.ID == id {
			return u, true
		}
	}
	return User{}, false
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	db := &store{}

	e := echo.New()
	e.Validator = &CustomValidator{v: validator.New()}

	e.Use(middleware.RequestLoggerWithConfig(middleware.RequestLoggerConfig{
		LogMethod: true, LogURI: true, LogStatus: true, LogLatency: true,
		LogValuesFunc: func(c *echo.Context, v middleware.RequestLoggerValues) error {
			logger.Info("request", "method", v.Method, "uri", v.URI, "status", v.Status, "latency", v.Latency)
			return nil
		},
	}))
	e.Use(middleware.Recover())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"https://app.northwind-logistics.io"},
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete},
	}))
	e.Use(middleware.RateLimiter(middleware.NewRateLimiterMemoryStore(20)))

	e.GET("/health", func(c *echo.Context) error { return c.String(http.StatusOK, "ok") })

	api := e.Group("/api/v1")
	api.Use(echojwt.WithConfig(echojwt.Config{
		SigningKey: []byte(os.Getenv("JWT_SECRET")),
	}))
	api.POST("/users", func(c *echo.Context) error {
		var req CreateUserRequest
		if err := c.Bind(&req); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
		}
		if err := c.Validate(&req); err != nil {
			return err
		}
		return c.JSON(http.StatusCreated, db.create(req))
	})
	api.GET("/users/:id", func(c *echo.Context) error {
		id, err := echo.PathParam[int](c, "id")
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "id must be a number")
		}
		u, ok := db.find(id)
		if !ok {
			return echo.NewHTTPError(http.StatusNotFound, "user not found")
		}
		return c.JSON(http.StatusOK, u)
	})
	api.GET("/me", func(c *echo.Context) error {
		token, err := echo.ContextGet[*jwt.Token](c, "user")
		if err != nil {
			return echo.ErrUnauthorized
		}
		claims := token.Claims.(jwt.MapClaims)
		return c.JSON(http.StatusOK, map[string]any{"sub": claims["sub"]})
	})
	api.GET("/page", func(c *echo.Context) error {
		page, err := echo.QueryParamOr[int](c, "page", 1)
		if err != nil || page < 1 {
			return echo.NewHTTPError(http.StatusBadRequest, "page must be a positive number")
		}
		return c.JSON(http.StatusOK, map[string]int{"page": page})
	})

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	sc := echo.StartConfig{Address: os.Getenv("ADDR"), GracefulTimeout: 10 * time.Second}
	if err := sc.Start(ctx, e); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("server stopped", "error", err)
	}
}
```

Run it with a secret from the environment and call it:

```console
$ JWT_SECRET=$(openssl rand -hex 32) ADDR=127.0.0.1:8080 go run .
$ curl -s -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d '{"name":"Maria Santos","email":"maria@northwind-logistics.io","age":34}' \
    http://127.0.0.1:8080/api/v1/users
{"id":1,"name":"Maria Santos","email":"maria@northwind-logistics.io","age":34}
```

A request without a token gets `401 {"message":"missing or malformed jwt"}`; an invalid body gets `400` with the validator message.

### What changed from v4 to v5

| v4 | v5 |
|----|----|
| `func(c echo.Context) error` (interface) | `func(c *echo.Context) error` (struct pointer) |
| `middleware.Logger()` | removed: use `middleware.RequestLoggerWithConfig` with `log/slog` |
| `e.Logger` custom interface | `e.Logger` is a `*slog.Logger` |
| `e.Start(":3000")` plus manual `e.Shutdown(ctx)` | `e.Start` remains; for graceful shutdown use `echo.StartConfig{Address, GracefulTimeout}.Start(ctx, e)`, which stops when `ctx` is cancelled |
| `c.Get("user").(*jwt.Token)` | `echo.ContextGet[*jwt.Token](c, "user")` |
| `strconv.Atoi(c.QueryParam("page"))` | `echo.QueryParamOr[int](c, "page", 1)`; also `echo.PathParam[T]` |
| `github.com/labstack/echo-jwt/v4` | `github.com/labstack/echo-jwt/v5` (uses `golang-jwt/jwt/v5`) |

The upstream migration list is `API_CHANGES_V5.md` in the echo repository. On v4 keep `github.com/labstack/echo/v4`, the `echo.Context` interface, `middleware.Logger()` and `e.Start`.

### Validation

Echo does not validate by itself: `c.Bind` only decodes. Set `e.Validator` once (see `CustomValidator` above) and call `c.Validate(&req)` after `c.Bind(&req)` in every handler that needs it; without a registered validator `c.Validate` returns an error.

### Errors

Return `echo.NewHTTPError(status, message)` from handlers; the default error handler turns it into `{"message": "..."}` with that status. Set `e.HTTPErrorHandler` for a custom JSON shape. Sentinels such as `echo.ErrUnauthorized` and `echo.ErrNotFound` exist.

### Groups and per-route middleware

```go
admin := e.Group("/admin", requireAdmin) // requireAdmin is an echo.MiddlewareFunc
admin.GET("/stats", getStats)
e.GET("/export", exportCSV, middleware.BodyLimit(1<<20))
```

Middleware registered with `e.Use` runs after routing; use `e.Pre(...)` for things that must run before routing (trailing-slash rewrites, `MethodOverride`).

### Static files

```go
e.Static("/assets", "public")
```

In 5.4.0 the static handler stopped serving paths with `.`, `..` or empty segments and stopped decoding odd escapes by default. Static middleware registered with `e.Use` runs before route and group middleware, so a guard on a route does not protect files served this way.

### Tests

```go
func TestHealth(t *testing.T) {
	e := echo.New()
	e.GET("/health", func(c *echo.Context) error { return c.String(http.StatusOK, "ok") })
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health", nil))
	if rec.Code != http.StatusOK || rec.Body.String() != "ok" {
		t.Fatalf("got %d %q", rec.Code, rec.Body.String())
	}
}
```

## Examples

### Example 1: "Add a paginated list endpoint with a default page"

Add `api.GET("/page", ...)` as in the program: `echo.QueryParamOr[int](c, "page", 1)` returns 1 when the parameter is missing and an error when it is not a number, which you map to a 400. `GET /api/v1/page?page=3` returns `{"page":3}`.

### Example 2: "Protect everything under /api/v1 with a JWT but leave /health open"

Register `/health` on `e` and attach `echojwt.WithConfig(echojwt.Config{SigningKey: []byte(os.Getenv("JWT_SECRET"))})` to the `/api/v1` group only. `GET /health` returns `ok`; `GET /api/v1/me` without a token returns 401, and with a valid HS256 token returns the claims you read with `echo.ContextGet[*jwt.Token](c, "user")`.

## Guidelines

- Pin the major version in the import path and in your prompt: v4 and v5 handler signatures are not compatible.
- Never ship a default or empty `SigningKey`; read it from the environment and fail at start-up when it is empty.
- Behind a reverse proxy, v5.4.0+ trusts `X-Forwarded-Proto` only from loopback, link-local and private addresses. For a proxy on a public address (some CDNs and cloud load balancers) set `e.SchemeExtractor = echo.ExtractSchemeFromHeaders(echo.TrustIPRange(cidr))`; otherwise `HTTPSRedirect` can loop. Make the proxy set `X-Forwarded-Proto` itself.
- `middleware.NewRateLimiterMemoryStore` keeps counters in process memory; use a shared store when you run several replicas.
- `CORS`: list exact origins; never combine `AllowOrigins: ["*"]` with credentials.
- Do not use `Context.JSONP` for authenticated data.
- Handlers share state across goroutines: guard shared maps and slices (the example uses a mutex).
