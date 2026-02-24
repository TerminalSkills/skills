---
name: django
description: |
  Django is a batteries-included Python web framework that follows the model-template-view
  pattern. It provides an ORM, admin interface, authentication, and everything needed to
  build full-featured web applications rapidly and securely.
license: Apache-2.0
compatibility:
  - python >= 3.10
  - pip
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - python
    - web
    - orm
    - admin
    - rest
    - fullstack
---

# Django

Django is a high-level Python web framework that encourages rapid development. It includes an ORM, template engine, admin site, form handling, authentication, and security middleware out of the box.

## Installation

```bash
# Install Django and start a project
pip install django
django-admin startproject myproject .
python manage.py startapp core
```

## Project Structure

```
# Standard Django project layout
myproject/
├── manage.py
├── myproject/
│   ├── settings.py      # Configuration
│   ├── urls.py          # Root URL config
│   ├── wsgi.py          # WSGI entry point
│   └── asgi.py          # ASGI entry point
├── core/
│   ├── models.py        # Database models
│   ├── views.py         # View functions/classes
│   ├── urls.py          # App URL patterns
│   ├── admin.py         # Admin registration
│   ├── forms.py         # Form classes
│   ├── serializers.py   # DRF serializers
│   ├── templates/       # HTML templates
│   └── tests.py
└── templates/           # Project-level templates
```

## Models

```python
# core/models.py — database models with Django ORM
from django.db import models
from django.contrib.auth.models import AbstractUser

class User(AbstractUser):
    bio = models.TextField(blank=True)
    avatar = models.ImageField(upload_to="avatars/", blank=True)

class Article(models.Model):
    title = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)
    body = models.TextField()
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name="articles")
    published = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title
```

## Views

```python
# core/views.py — function-based and class-based views
from django.shortcuts import render, get_object_or_404, redirect
from django.views.generic import ListView, DetailView, CreateView
from django.contrib.auth.mixins import LoginRequiredMixin
from .models import Article
from .forms import ArticleForm

class ArticleListView(ListView):
    model = Article
    queryset = Article.objects.filter(published=True).select_related("author")
    template_name = "core/article_list.html"
    paginate_by = 20

class ArticleDetailView(DetailView):
    model = Article
    slug_field = "slug"
    template_name = "core/article_detail.html"

class ArticleCreateView(LoginRequiredMixin, CreateView):
    model = Article
    form_class = ArticleForm
    template_name = "core/article_form.html"

    def form_valid(self, form):
        form.instance.author = self.request.user
        return super().form_valid(form)
```

## URL Configuration

```python
# core/urls.py — URL patterns for the core app
from django.urls import path
from . import views

app_name = "core"
urlpatterns = [
    path("", views.ArticleListView.as_view(), name="article-list"),
    path("<slug:slug>/", views.ArticleDetailView.as_view(), name="article-detail"),
    path("new/", views.ArticleCreateView.as_view(), name="article-create"),
]
```

```python
# myproject/urls.py — root URL configuration
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("articles/", include("core.urls")),
    path("api/", include("core.api_urls")),
]
```

## Admin

```python
# core/admin.py — admin site registration
from django.contrib import admin
from .models import Article

@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = ["title", "author", "published", "created_at"]
    list_filter = ["published", "created_at"]
    search_fields = ["title", "body"]
    prepopulated_fields = {"slug": ("title",)}
    raw_id_fields = ["author"]
```

## Templates

```html
<!-- templates/core/article_list.html — list view template -->
{% extends "base.html" %}
{% block content %}
<h1>Articles</h1>
{% for article in object_list %}
  <article>
    <h2><a href="{{ article.get_absolute_url }}">{{ article.title }}</a></h2>
    <p>By {{ article.author.username }} — {{ article.created_at|date:"M d, Y" }}</p>
  </article>
{% empty %}
  <p>No articles yet.</p>
{% endfor %}
{% include "core/_pagination.html" %}
{% endblock %}
```

## Django REST Framework

```python
# core/serializers.py — DRF serializers
from rest_framework import serializers
from .models import Article

class ArticleSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.username", read_only=True)

    class Meta:
        model = Article
        fields = ["id", "title", "slug", "body", "author_name", "published", "created_at"]
        read_only_fields = ["slug"]
```

```python
# core/api_views.py — DRF viewsets
from rest_framework import viewsets, permissions
from .models import Article
from .serializers import ArticleSerializer

class ArticleViewSet(viewsets.ModelViewSet):
    queryset = Article.objects.filter(published=True)
    serializer_class = ArticleSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    lookup_field = "slug"

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)
```

## Migrations

```bash
# Create and apply database migrations
python manage.py makemigrations core
python manage.py migrate
python manage.py createsuperuser
```

## Settings Essentials

```python
# myproject/settings.py — key settings to configure
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "change-me")
DEBUG = os.environ.get("DEBUG", "True") == "True"
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost").split(",")

AUTH_USER_MODEL = "core.User"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DB_NAME", "mydb"),
        "USER": os.environ.get("DB_USER", "postgres"),
        "PASSWORD": os.environ.get("DB_PASSWORD", ""),
        "HOST": os.environ.get("DB_HOST", "localhost"),
    }
}

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
```

## Testing

```python
# core/tests.py — Django test example
from django.test import TestCase, Client
from django.urls import reverse
from .models import Article, User

class ArticleTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="test", password="pass1234")
        self.article = Article.objects.create(
            title="Test", slug="test", body="Hello", author=self.user, published=True
        )

    def test_list_view(self):
        resp = self.client.get(reverse("core:article-list"))
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, "Test")
```

## Running

```bash
# Run development server
python manage.py runserver 0.0.0.0:8000
```

## Key Patterns

- Use `select_related` and `prefetch_related` to avoid N+1 queries
- Set `AUTH_USER_MODEL` early — it's hard to change after first migration
- Use class-based views for CRUD; function views for custom logic
- Middleware order matters: SecurityMiddleware first, then SessionMiddleware
- Use `django-environ` or `os.environ` for secrets — never hardcode
- Run `python manage.py check --deploy` before production deployment
