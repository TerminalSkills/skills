---
name: go-fiber
description: >-
   You are an expert in Fiber, the Express.js-inspired web framework for Go
  built on top of Fasthttp. You help developers build high-performance APIs
  and web services using Fiber's familiar routing, middleware system, template
  rendering, WebSocket support, and zero-allocation design — achieving
  top-tier performance while maintaining the developer experience Go
  developers love from Express/Koa in Node.js.
category: Backend Development
tags: [go, web-framework, fast, express-inspired, api, middleware]
version: 1.0.0
author: terminal-skills
---

# Fiber — Express-Inspired Go Web Framework

You are an expert in Fiber, the Express.js-inspired web framework for Go built on top of Fasthttp. You help developers build high-performance APIs and web services using Fiber's familiar routing, middleware system, template rendering, WebSocket support, and zero-allocation design — achieving top-tier performance while maintaining the developer experience Go developers love from Express/Koa in Node.js.

## Core Capabilities

### Application Setup

```go
// main.go — Fiber API server
package main

import (
    "log"
    "github.com/gofiber/fiber/v2"
    "github.com/gofiber/fiber/v2/middleware/cors"
    "github.com/gofiber/fiber/v2/middleware/logger"
    "github.com/gofiber/fiber/v2/middleware/recover"
    "github.com/gofiber/fiber/v2/middleware/limiter"
)

func main() {
    app := fiber.New(fiber.Config{
        ErrorHandler: customErrorHandler,
        BodyLimit:    4 * 1024 * 1024,    // 4MB
    })

    // Middleware
    app.Use(recover.New())
    app.Use(logger.New())
    app.Use(cors.New())
    app.Use(limiter.New(limiter.Config{
        Max:        100,
        Expiration: 60,                   // 100 requests per minute
    }))

    // Routes
    api := app.Group("/api/v1")
    api.Get("/users", listUsers)
    api.Get("/users/:id", getUser)
    api.Post("/users", createUser)
    api.Put("/users/:id", updateUser)
    api.Delete("/users/:id", deleteUser)

    // Health check
    app.Get("/health", func(c *fiber.Ctx) error {
        return c.JSON(fiber.Map{"status": "ok"})
    })

    log.Fatal(app.Listen(":3000"))
}
```

### Handlers

```go
type User struct {
    ID        uint   `json:"id" gorm:"primaryKey"`
    Name      string `json:"name" validate:"required,min=2"`
    Email     string `json:"email" validate:"required,email"`
    CreatedAt time.Time `json:"created_at"`
}

type CreateUserRequest struct {
    Name  string `json:"name" validate:"required,min=2,max=100"`
    Email string `json:"email" validate:"required,email"`
}

func createUser(c *fiber.Ctx) error {
    var req CreateUserRequest
    if err := c.BodyParser(&req); err != nil {
        return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
    }

    // Validate
    if errors := validate.Struct(req); errors != nil {
        return c.Status(422).JSON(fiber.Map{"errors": formatErrors(errors)})
    }

    user := User{Name: req.Name, Email: req.Email}
    if result := db.Create(&user); result.Error != nil {
        return c.Status(500).JSON(fiber.Map{"error": "Failed to create user"})
    }

    return c.Status(201).JSON(user)
}

func getUser(c *fiber.Ctx) error {
    id := c.Params("id")                  // Path parameter
    var user User
    if result := db.First(&user, id); result.Error != nil {
        return c.Status(404).JSON(fiber.Map{"error": "User not found"})
    }
    return c.JSON(user)
}

func listUsers(c *fiber.Ctx) error {
    page := c.QueryInt("page", 1)         // Query parameter with default
    perPage := c.QueryInt("per_page", 20)
    
    var users []User
    var total int64
    db.Model(&User{}).Count(&total)
    db.Offset((page - 1) * perPage).Limit(perPage).Find(&users)
    
    return c.JSON(fiber.Map{
        "data":  users,
        "total": total,
        "page":  page,
    })
}
```

### Middleware

```go
// Custom auth middleware
func authMiddleware(c *fiber.Ctx) error {
    token := c.Get("Authorization")
    if token == "" {
        return c.Status(401).JSON(fiber.Map{"error": "Missing token"})
    }

    claims, err := validateJWT(strings.TrimPrefix(token, "Bearer "))
    if err != nil {
        return c.Status(401).JSON(fiber.Map{"error": "Invalid token"})
    }

    c.Locals("user_id", claims.UserID)    // Store in request context
    return c.Next()                        // Continue to handler
}

// Apply to group
protected := app.Group("/api/v1", authMiddleware)
protected.Get("/profile", getProfile)
protected.Put("/profile", updateProfile)
```

## Installation

```bash
go mod init myapp
go get github.com/gofiber/fiber/v2
```

## Best Practices

1. **Familiar API** — Fiber mirrors Express.js patterns; `c.Params()`, `c.Query()`, `c.JSON()`, `c.Next()`
2. **Built-in middleware** — CORS, rate limiter, logger, recover, compress, cache — all included
3. **Fasthttp engine** — Built on Fasthttp (not net/http); zero-allocation, 10x faster than standard library
4. **Group routes** — Use `app.Group()` for versioned APIs and middleware scoping
5. **Error handling** — Use custom `ErrorHandler` in config; return `fiber.NewError(status, message)` from handlers
6. **Locals for context** — Use `c.Locals()` to pass data between middleware and handlers (auth user, request ID)
7. **Prefork for production** — Enable `Prefork: true` in config to spawn worker processes per CPU core
8. **Graceful shutdown** — Use `app.ShutdownWithTimeout()` with signal handling; drains active connections
