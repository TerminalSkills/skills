---
name: gin
description: |
  Gin is a high-performance HTTP web framework for Go with a martini-like API.
  It features fast routing with radix trees, middleware support, JSON binding
  and validation, and structured error handling for building REST APIs.
license: Apache-2.0
compatibility:
  - go >= 1.21
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frameworks
  tags:
    - go
    - web
    - api
    - rest
    - performance
    - middleware
---

# Gin

Gin is the most popular Go web framework. It provides fast HTTP routing, middleware chaining, JSON/XML binding with validation, and structured error handling.

## Installation

```bash
# Initialize Go module and install Gin
mkdir my-api && cd my-api
go mod init github.com/example/my-api
go get github.com/gin-gonic/gin
```

## Project Structure

```
# Recommended Go project layout with Gin
cmd/server/main.go        # Entry point
internal/
├── handler/              # HTTP handlers
│   └── article.go
├── middleware/            # Custom middleware
│   └── auth.go
├── model/                # Data models
│   └── article.go
├── repository/           # Database layer
│   └── article.go
├── service/              # Business logic
│   └── article.go
└── config/               # Configuration
    └── config.go
```

## Basic Setup

```go
// cmd/server/main.go — application entry point
package main

import (
	"log"
	"github.com/gin-gonic/gin"
	"github.com/example/my-api/internal/handler"
	"github.com/example/my-api/internal/middleware"
)

func main() {
	r := gin.Default() // includes Logger and Recovery middleware

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	api := r.Group("/api")
	api.Use(middleware.Auth())
	{
		api.GET("/articles", handler.ListArticles)
		api.GET("/articles/:id", handler.GetArticle)
		api.POST("/articles", handler.CreateArticle)
		api.DELETE("/articles/:id", handler.DeleteArticle)
	}

	log.Fatal(r.Run(":8080"))
}
```

## Models and Binding

```go
// internal/model/article.go — data models with binding tags
package model

import "time"

type Article struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	Title     string    `json:"title" gorm:"size:200;not null"`
	Body      string    `json:"body" gorm:"type:text;not null"`
	AuthorID  uint      `json:"author_id"`
	Published bool      `json:"published" gorm:"default:false"`
	CreatedAt time.Time `json:"created_at"`
}

type CreateArticleRequest struct {
	Title string `json:"title" binding:"required,max=200"`
	Body  string `json:"body" binding:"required"`
}

type ArticleResponse struct {
	ID        uint      `json:"id"`
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	Author    string    `json:"author"`
	CreatedAt time.Time `json:"created_at"`
}
```

## Handlers

```go
// internal/handler/article.go — HTTP handlers
package handler

import (
	"net/http"
	"strconv"
	"github.com/gin-gonic/gin"
	"github.com/example/my-api/internal/model"
	"github.com/example/my-api/internal/service"
)

type ArticleHandler struct {
	svc *service.ArticleService
}

func NewArticleHandler(svc *service.ArticleService) *ArticleHandler {
	return &ArticleHandler{svc: svc}
}

func (h *ArticleHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))

	articles, err := h.svc.List(c.Request.Context(), page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, articles)
}

func (h *ArticleHandler) Create(c *gin.Context) {
	var req model.CreateArticleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	article, err := h.svc.Create(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create"})
		return
	}
	c.JSON(http.StatusCreated, article)
}

func (h *ArticleHandler) Get(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	article, err := h.svc.GetByID(c.Request.Context(), uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, article)
}
```

## Middleware

```go
// internal/middleware/auth.go — JWT auth middleware
package middleware

import (
	"net/http"
	"strings"
	"github.com/gin-gonic/gin"
)

func Auth() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			return
		}
		token := strings.TrimPrefix(header, "Bearer ")
		userID, err := validateToken(token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		c.Set("userID", userID)
		c.Next()
	}
}

func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		status := c.Writer.Status()
		gin.DefaultWriter.Write([]byte(
			c.Request.Method + " " + c.Request.URL.Path + " " + strconv.Itoa(status) + "\n",
		))
	}
}
```

## Graceful Shutdown

```go
// cmd/server/main.go — graceful shutdown pattern
package main

import (
	"context"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	r := setupRouter()

	srv := &http.Server{Addr: ":8080", Handler: r}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Shutdown(shutdownCtx)
}
```

## Testing

```go
// internal/handler/article_test.go — handler test
package handler_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestListArticles(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/articles", handler.List)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/articles", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, 200, w.Code)
}
```

## Key Patterns

- Use `ShouldBindJSON` (not `BindJSON`) to handle validation errors yourself
- Use route groups (`r.Group`) for shared prefixes and middleware
- Use `gin.H{}` for quick JSON maps; use structs for typed responses
- Use `c.Request.Context()` to pass context to services/DB calls for cancellation
- Use `gin.Default()` for logging+recovery; `gin.New()` for bare router in tests
- Structure code in layers: handler → service → repository for testability
