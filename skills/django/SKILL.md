---
name: django
description: |
  Django is a batteries-included Python web framework with an ORM, admin site, authentication,
  forms and templates. Use when asked to start a Django project, write models, views, URLs or
  admin, add a REST API with Django REST framework, run migrations, configure settings for
  production, or write Django tests.
license: Apache-2.0
compatibility: 'Python 3.12+ for Django 6.x (Django 5.2 LTS for Python 3.10 and 3.11), pip'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/django/django
  tags: "python, web, orm, admin, fullstack"
---

# Django

## Overview

Django is a high-level Python web framework with an ORM, migrations, admin site, forms, template engine, authentication and security middleware built in. Current release is Django 6.1 (needs Python 3.12 or newer); the 5.2 LTS series is the last that supports Python 3.10 and 3.11, and 6.2 is the next LTS. Django 6.0 added built-in Content Security Policy support and a Tasks framework (`django.tasks`). The code below was run on Django 6.1.2 with Django REST framework 3.18.3 and Pillow 13: `manage.py check` is clean and the tests pass.

## Instructions

### Install and start a project

```console
$ python3 -m venv .venv && source .venv/bin/activate
$ pip install django djangorestframework pillow
$ django-admin startproject newsroom .
$ python manage.py startapp core
```

Pillow is only needed for `ImageField`. Add `'rest_framework'` and `'core'` to `INSTALLED_APPS`, and set `AUTH_USER_MODEL = "core.User"` **before the first migration**: changing it later is painful.

### Models

```python
# core/models.py
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.urls import reverse


class User(AbstractUser):
    bio = models.TextField(blank=True)
    avatar = models.ImageField(upload_to="avatars/", blank=True)  # needs Pillow


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

    def get_absolute_url(self):
        return reverse("core:article-detail", kwargs={"slug": self.slug})
```

### Views

The detail view filters to published articles, so drafts return 404. `DetailView` finds the object by the `slug` URL kwarg by default.

```python
# core/views.py
from django.contrib.auth.mixins import LoginRequiredMixin
from django.views.generic import CreateView, DetailView, ListView

from .forms import ArticleForm
from .models import Article


class ArticleListView(ListView):
    queryset = Article.objects.filter(published=True).select_related("author")
    template_name = "core/article_list.html"
    paginate_by = 20


class ArticleDetailView(DetailView):
    queryset = Article.objects.filter(published=True).select_related("author")
    template_name = "core/article_detail.html"  # looks up by the <slug:slug> URL kwarg


class ArticleCreateView(LoginRequiredMixin, CreateView):
    model = Article
    form_class = ArticleForm
    template_name = "core/article_form.html"

    def form_valid(self, form):
        form.instance.author = self.request.user
        return super().form_valid(form)
```

### URLs

Order matters: `new/` must come before `<slug:slug>/`, otherwise "new" is read as a slug and the create view is unreachable.

```python
# core/urls.py
from django.urls import path

from . import views

app_name = "core"
urlpatterns = [
    path("", views.ArticleListView.as_view(), name="article-list"),
    path("new/", views.ArticleCreateView.as_view(), name="article-create"),  # before the slug route
    path("<slug:slug>/", views.ArticleDetailView.as_view(), name="article-detail"),
]
```

```python
# newsroom/urls.py
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("articles/", include("core.urls")),
    path("api/", include("core.api_urls")),
]
```

### Forms and admin

`ArticleForm` is a `ModelForm` with `fields = ["title", "slug", "body", "published"]` (never `__all__`, so `author` stays server-controlled).

```python
# core/admin.py
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

### Templates

Add `BASE_DIR / "templates"` to `TEMPLATES["DIRS"]` and create `templates/base.html` with a `{% block content %}`. The list template (`core/templates/core/article_list.html`) loops `{% for article in object_list %}` with `{% empty %}`, links with `{{ article.get_absolute_url }}`, and shows pagination from `is_paginated`, `page_obj.has_previous` and `page_obj.has_next` (the `?page=N` links).

### REST API with Django REST framework

```python
# core/serializers.py
from rest_framework import serializers

from .models import Article


class ArticleSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.username", read_only=True)

    class Meta:
        model = Article
        fields = ["id", "title", "slug", "body", "author_name", "published", "created_at"]
```

```python
# core/api_views.py
from rest_framework import permissions, viewsets

from .models import Article
from .serializers import ArticleSerializer


class ArticleViewSet(viewsets.ModelViewSet):
    queryset = Article.objects.filter(published=True).select_related("author")
    serializer_class = ArticleSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    lookup_field = "slug"

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)
```

```python
# core/api_urls.py
from rest_framework.routers import DefaultRouter

from .api_views import ArticleViewSet

router = DefaultRouter()
router.register("articles", ArticleViewSet, basename="article")
urlpatterns = router.urls
```

`/api/articles/` now lists published articles, and any authenticated user can create, update and delete any of them: add an object-level `BasePermission` that compares `obj.author` with `request.user` before exposing it. Configure `REST_FRAMEWORK` (authentication classes, pagination) in settings before exposing it.

### Migrations

```console
$ python manage.py makemigrations core
$ python manage.py migrate
$ python manage.py createsuperuser
```

### Settings

Read secrets and switches from the environment. This keeps the generated `settings.py` and changes only these lines:

```python
import os

SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]   # no default: fail fast when missing
DEBUG = os.environ.get("DJANGO_DEBUG") == "1"  # off unless explicitly enabled
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

AUTH_USER_MODEL = "core.User"
STATIC_ROOT = BASE_DIR / "staticfiles"
```

For PostgreSQL install `psycopg[binary]` and set `DATABASES["default"]["ENGINE"] = "django.db.backends.postgresql"` with `NAME`, `USER`, `PASSWORD`, `HOST` from the environment. SQLite (the default) is fine for development.

### Run and test

```console
$ export DJANGO_SECRET_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(50))") DJANGO_DEBUG=1
$ python manage.py runserver
$ python manage.py test
```

```python
# core/tests.py
from django.test import TestCase
from django.urls import reverse

from .models import Article, User


class ArticleTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="maria", password="s3cret-Pass-42")
        Article.objects.create(title="Port strike ends", slug="port-strike-ends",
                               body="Talks resumed.", author=cls.user, published=True)

    def test_list_shows_published(self):
        self.assertContains(self.client.get(reverse("core:article-list")), "Port strike ends")

    def test_new_route_is_not_swallowed_by_slug(self):
        self.assertEqual(self.client.get(reverse("core:article-create")).status_code, 302)  # login redirect

    def test_create_sets_author(self):
        self.client.login(username="maria", password="s3cret-Pass-42")
        self.client.post(reverse("core:article-create"),
                         {"title": "Harbor budget", "slug": "harbor-budget", "body": "x", "published": "on"})
        self.assertEqual(Article.objects.get(slug="harbor-budget").author, self.user)
```

### Before production

```console
$ python manage.py check --deploy
```

On this project it reports the missing `SECURE_HSTS_SECONDS`, `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE` and `CSRF_COOKIE_SECURE` settings, and in 6.1 an error until the default console mail backend is replaced with a real one in the `MAILERS` setting. Serve static files with `collectstatic` plus a web server or WhiteNoise, and run the app with gunicorn or uvicorn, not `runserver`.

## Examples

### Example 1: "Add a published/unpublished filter to the admin"

`list_filter = ["published", "created_at"]` in `ArticleAdmin` (already in the code above) adds sidebar filters; `search_fields = ["title", "body"]` adds the search box. Open `/admin/` after `createsuperuser`.

### Example 2: "The article list is slow, it runs one query per row"

The list template prints `article.author.username`, which hits the database for every article. `select_related("author")` in the view's queryset fetches it in one JOIN; use `prefetch_related` for reverse or many-to-many relations. Check with `django-debug-toolbar` or `assertNumQueries(2)` in a test (one query for the count from pagination, one for the page).

## Guidelines

- Never ship a hard-coded or default `SECRET_KEY`, and never run with `DEBUG = True` in production (it exposes settings and source in error pages).
- Set `AUTH_USER_MODEL` at the start, even if you only subclass `AbstractUser`.
- Use class-based views for standard CRUD and plain functions for custom flow.
- Keep migrations in version control and review them; never edit one that has been applied elsewhere.
- Middleware order matters: `SecurityMiddleware` first, `SessionMiddleware` before `AuthenticationMiddleware`.
- Test with `TestCase` (each test runs in a transaction) and create users with `create_user` so passwords are hashed.
- When upgrading, move one release at a time and run tests with `python -W error::DeprecationWarning manage.py test` to find deprecated API before it is removed.
