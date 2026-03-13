---
name: go-echo
description: >-
  You are an expert in Echo, the high-performance, minimalist Go web
  framework. You help developers build REST APIs and web applications using
  Echo's optimized router, middleware chain, data binding, validation,
  template rendering, and WebSocket support — providing a clean API surface
  with excellent performance and comprehensive built-in middleware.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Backend Development
  tags:
    - go
    - web-framework
    - api
    - middleware
    - rest
    - high-performance
---

# Echo — High-Performance Go Web Framework

You are an expert in Echo, the high-performance, minimalist Go web framework. You help developers build REST APIs and web applications using Echo's optimized router, middleware chain, data binding, validation, template rendering, and WebSocket support — providing a clean API surface with excellent performance and comprehensive built-in middleware.

## Core Capabilities

### Application Setup

```go
package main

import (
    "net/http"
    "github.com/labstack/echo/v4"
    "github.com/labstack/echo/v4/middleware"
)

func main() {
    e := echo.New()

    // Middleware
    e.Use(middleware.Logger())
    e.Use(middleware.Recover())
    e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
        AllowOrigins: []string{"https://app.example.com"},
        AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete},
    }))
    e.Use(middleware.RateLimiter(middleware.NewRateLimiterMemoryStore(20)))

    // Routes
    e.GET("/users", listUsers)
    e.POST("/users", createUser)
    e.GET("/users/:id", getUser)

    // Groups with middleware
    admin := e.Group("/admin", adminAuth)
    admin.GET("/stats", getStats)

    e.Logger.Fatal(e.Start(":3000"))
}
```

### Handlers and Binding

```go
type CreateUserRequest struct {
    Name  string `json:"name" validate:"required,min=2"`
    Email string `json:"email" validate:"required,email"`
    Age   int    `json:"age" validate:"gte=0,lte=130"`
}

func createUser(c echo.Context) error {
    var req CreateUserRequest
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "Invalid request")
    }
    if err := c.Validate(&req); err != nil {
        return err
    }

    user, err := db.CreateUser(req.Name, req.Email, req.Age)
    if err != nil {
        return echo.NewHTTPError(http.StatusInternalServerError, "Failed to create user")
    }

    return c.JSON(http.StatusCreated, user)
}

func getUser(c echo.Context) error {
    id := c.Param("id")                   // Path param
    user, err := db.FindUser(id)
    if err != nil {
        return echo.NewHTTPError(http.StatusNotFound, "User not found")
    }
    return c.JSON(http.StatusOK, user)
}

func listUsers(c echo.Context) error {
    page, _ := strconv.Atoi(c.QueryParam("page"))  // Query param
    if page < 1 { page = 1 }

    users, total := db.ListUsers(page, 20)
    return c.JSON(http.StatusOK, map[string]interface{}{
        "data": users, "total": total, "page": page,
    })
}
```

### JWT Middleware

```go
import "github.com/labstack/echo-jwt/v4"

// Configure JWT
e.Use(echojwt.WithConfig(echojwt.Config{
    SigningKey: []byte(os.Getenv("JWT_SECRET")),
    Skipper: func(c echo.Context) bool {
        return c.Path() == "/health" || c.Path() == "/login"
    },
}))

// Access claims in handler
func getProfile(c echo.Context) error {
    token := c.Get("user").(*jwt.Token)
    claims := token.Claims.(jwt.MapClaims)
    userID := claims["user_id"].(string)
    // ...
}
```

## Installation

```bash
go get github.com/labstack/echo/v4
go get github.com/labstack/echo-jwt/v4
```

## Best Practices

1. **Context methods** — Use `c.Bind()` for request parsing, `c.JSON()` for responses, `c.Param()` / `c.QueryParam()` for params
2. **Groups for versioning** — `e.Group("/api/v1")` with per-group middleware (auth, rate limiting)
3. **HTTPError for responses** — Return `echo.NewHTTPError(status, message)` for consistent error responses
4. **Validator** — Register a custom validator with `e.Validator`; Echo calls it automatically after `Bind()`
5. **Middleware chaining** — `e.Use()` for global, group-level, or per-route; Echo processes in order
6. **Graceful shutdown** — Use `e.Shutdown(ctx)` with signal handling; drains active connections
7. **Custom context** — Extend `echo.Context` for request-scoped data (user, logger, trace ID)
8. **Static files** — `e.Static("/assets", "public")` for serving static files alongside API routes
