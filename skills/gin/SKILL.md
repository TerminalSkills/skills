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
go mod init github.com/example/my-api
go get github.com/gin-gonic/gin
```

## Basic Setup

```go
// cmd/server/main.go — application entry point
package main

import (
	"github.com/gin-gonic/gin"
	"github.com/example/my-api/internal/handler"
	"github.com/example/my-api/internal/middleware"
)

func main() {
	r := gin.Default()

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	api := r.Group("/api")
	api.Use(middleware.Auth())
	{
		api.GET("/articles", handler.ListArticles)
		api.POST("/articles", handler.CreateArticle)
		api.GET("/articles/:id", handler.GetArticle)
	}

	r.Run(":8080")
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
	CreatedAt time.Time `json:"created_at"`
}

type CreateArticleRequest struct {
	Title string `json:"title" binding:"required,max=200"`
	Body  string `json:"body" binding:"required"`
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

func ListArticles(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	articles, err := service.ListArticles(c.Request.Context(), page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, articles)
}

func CreateArticle(c *gin.Context) {
	var req model.CreateArticleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	article, err := service.CreateArticle(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create"})
		return
	}
	c.JSON(http.StatusCreated, article)
}

func GetArticle(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	article, err := service.GetByID(c.Request.Context(), uint(id))
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
```

## Graceful Shutdown

```go
// cmd/server/main.go — graceful shutdown pattern
func main() {
	r := setupRouter()
	srv := &http.Server{Addr: ":8080", Handler: r}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() { srv.ListenAndServe() }()
	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	srv.Shutdown(shutdownCtx)
}
```

## Testing

```go
// internal/handler/article_test.go — handler test
func TestListArticles(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/articles", ListArticles)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/articles", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, 200, w.Code)
}
```

## Key Patterns

- Use `ShouldBindJSON` (not `BindJSON`) to handle validation errors yourself
- Use route groups for shared prefixes and middleware
- Use `c.Request.Context()` to pass context to services for cancellation
- Structure code in layers: handler → service → repository
