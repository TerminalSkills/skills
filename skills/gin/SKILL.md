---
name: gin
description: >-
  Gin is a Go web framework with a Martini-like API and a zero-allocation
  router. Use it to build HTTP APIs that need routing, middleware, request
  binding/validation, JSON responses, and graceful shutdown with low
  per-request overhead. Use when a user asks to scaffold a Go HTTP API,
  add route groups or middleware, validate request bodies, or shut a Go
  server down cleanly.
license: Apache-2.0
compatibility: "Go 1.21+ (the current gin release's go.mod requires Go 1.26)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - go
    - web-framework
    - http
    - rest
    - middleware
  repository: https://github.com/gin-gonic/gin
---

# Gin — High-Performance Go Web Framework

## Overview

Gin is a minimal, fast HTTP web framework for Go built on `net/http` with a radix-tree router (originally based on httprouter). It provides routing, route groups, middleware chaining, request binding/validation via `go-playground/validator`, and JSON/XML/YAML rendering helpers. It is unopinionated about project layout and data access — you wire in your own database and auth logic.

## Instructions

### Install

```bash
go get github.com/gin-gonic/gin
```

This adds `github.com/gin-gonic/gin` to `go.mod`. Gin's own `go.mod` currently requires Go 1.26 to build from source; a project that only imports Gin as a dependency needs a Go toolchain at least that new to resolve the module.

### Build routes and middleware

- `gin.Default()` returns an engine with the `Logger` and `Recovery` middleware attached; `gin.New()` returns a bare engine.
- `r.Group("/api")` creates a route group; call `.Use(middleware)` on the group to scope middleware to it.
- Middleware is a `func(*gin.Context)`; call `c.Next()` to continue the chain or `c.Abort()`/`c.AbortWithStatusJSON(...)` to stop it.
- `c.ShouldBindJSON(&v)` parses and validates the request body against struct `binding` tags, returning an error instead of aborting — check it yourself.
- Set `GIN_MODE=release` (or `gin.SetMode(gin.ReleaseMode)`) in production; debug mode logs every route registration and is slower.

### Shut down without dropping in-flight requests

Gin's own `r.Run(":8080")` blocks forever and has no shutdown hook, so production services run `http.Server{Handler: r}` directly and call `Shutdown(ctx)` on a signal, as in Example 2 below.

## Examples

### Example 1: "Add a versioned `/api/v1` group with JWT auth and request validation"

```go
package main

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type CreateOrderRequest struct {
	ProductSKU string `json:"productSku" binding:"required"`
	Quantity   int    `json:"quantity" binding:"required,min=1"`
}

func main() {
	r := gin.Default() // Logger + Recovery middleware

	v1 := r.Group("/api/v1")
	v1.Use(authMiddleware())
	{
		v1.GET("/orders", listOrders)
		v1.POST("/orders", createOrder)
		v1.GET("/orders/:id", getOrder)
	}

	r.Run(":8080") // fine for local dev; see Example 2 for production
}

func listOrders(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))

	orders, total := store.FindOrders(page, limit)
	c.JSON(http.StatusOK, gin.H{"data": orders, "total": total, "page": page})
}

func createOrder(c *gin.Context) {
	var req CreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	order, err := store.CreateOrder(req.ProductSKU, req.Quantity)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create order"})
		return
	}
	c.JSON(http.StatusCreated, order)
}

func getOrder(c *gin.Context) {
	order, err := store.FindOrder(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
		return
	}
	c.JSON(http.StatusOK, order)
}

func authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.GetHeader("Authorization")
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			return
		}
		user, err := validateJWT(token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		c.Set("user", user)
		c.Next()
	}
}
```

Result: `POST /api/v1/orders` without a token returns `401 {"error":"missing token"}`; with a valid token and a body missing `quantity` it returns `400` naming the failed validation; a valid request returns `201` with the created order.

### Example 2: "Make the server shut down gracefully on SIGTERM so Kubernetes rollouts don't drop requests"

```go
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()
	r.GET("/healthz", func(c *gin.Context) { c.Status(http.StatusOK) })

	srv := &http.Server{Addr: ":8080", Handler: r}
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("forced shutdown: %v", err)
	}
}
```

Result: on `SIGTERM`, the process stops accepting new connections and waits up to 5 seconds for in-flight requests to finish before exiting, instead of killing them mid-response.

## Guidelines

- Prefer `ShouldBindJSON`/`ShouldBindQuery` over the panicking `BindJSON`/`BindQuery` variants — the `Should*` forms return an error you handle, while the non-`Should` forms abort the request with a 400 for you, which is easy to forget and double-handle.
- `gin.H{}` is a `map[string]any` alias — fine for ad-hoc responses, but use typed structs for anything with a documented response shape (OpenAPI, client codegen).
- Middleware runs in registration order on the way in and reverse order after `c.Next()` returns, so put logging/recovery first and auth after CORS.
- Gin does not include a built-in rate limiter, CORS handler, or JWT parser; pull in a dedicated middleware package (or write one) rather than reimplementing token parsing inline.
- Debug mode (the default) logs every registered route and warns on stdout; always set `GIN_MODE=release` for production builds.
- `r.Run()` has no graceful shutdown; use it only for local development, and switch to an explicit `http.Server` plus `Shutdown(ctx)` for anything deployed.
