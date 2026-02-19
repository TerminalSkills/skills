---
title: Build a Full-Stack App with Django and HTMX
slug: build-fullstack-app-with-django-and-htmx
description: Build an interactive web application with Django backend and HTMX for dynamic updates without writing JavaScript. Create a task management app with real-time search, inline editing, and live notifications.
skills:
  - django
  - htmx
  - postgresql
category: use-cases
tags:
  - python
  - fullstack
  - hypermedia
  - web
  - no-javascript
---

# Build a Full-Stack App with Django and HTMX

This walkthrough builds a task management application using Django for the backend and HTMX for dynamic frontend interactions. You'll get a fully interactive UI — search, inline editing, real-time updates — without writing a single line of JavaScript.

## Why Django + HTMX?

Django excels at rendering HTML server-side. HTMX extends that model by letting the server return HTML fragments that get swapped into the page dynamically. Together, they deliver SPA responsiveness while keeping all logic on the server.

## Step 1: Project Setup

```bash
# Terminal — create project and install dependencies
mkdir taskflow && cd taskflow
python -m venv venv && source venv/bin/activate
pip install django psycopg2-binary django-htmx
django-admin startproject config .
python manage.py startapp tasks
```

```python
# config/settings.py — essential configuration
INSTALLED_APPS = [
    "django.contrib.admin", "django.contrib.auth", "django.contrib.contenttypes",
    "django.contrib.sessions", "django.contrib.messages", "django.contrib.staticfiles",
    "django_htmx", "tasks",
]

MIDDLEWARE = [
    # ... default middleware ...
    "django_htmx.middleware.HtmxMiddleware",
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "taskflow",
        "USER": "postgres",
        "HOST": "localhost",
    }
}
```

## Step 2: Define the Model

```python
# tasks/models.py — task model with status choices
from django.db import models
from django.contrib.auth.models import User

class Task(models.Model):
    class Status(models.TextChoices):
        TODO = "todo", "To Do"
        IN_PROGRESS = "in_progress", "In Progress"
        DONE = "done", "Done"

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.TODO)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="tasks")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
```

## Step 3: Build the Views

Views return either a full page (initial load) or HTML fragment (HTMX request). The `django-htmx` middleware adds `request.htmx`.

```python
# tasks/views.py — views returning full pages or fragments
from django.shortcuts import render, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from .models import Task
from .forms import TaskForm

@login_required
def task_list(request):
    tasks = Task.objects.filter(owner=request.user)
    query = request.GET.get("q", "")
    if query:
        tasks = tasks.filter(title__icontains=query)

    status_filter = request.GET.get("status", "")
    if status_filter:
        tasks = tasks.filter(status=status_filter)

    ctx = {"tasks": tasks, "query": query, "status_filter": status_filter}

    if request.htmx:
        return render(request, "tasks/partials/task_list.html", ctx)
    return render(request, "tasks/index.html", ctx)

@login_required
def task_create(request):
    if request.method == "POST":
        form = TaskForm(request.POST)
        if form.is_valid():
            task = form.save(commit=False)
            task.owner = request.user
            task.save()
            return render(request, "tasks/partials/task_card.html", {"task": task})
        return render(request, "tasks/partials/task_form.html", {"form": form}, status=422)
    return render(request, "tasks/partials/task_form.html", {"form": TaskForm()})

@login_required
def task_update_status(request, pk):
    task = get_object_or_404(Task, pk=pk, owner=request.user)
    new_status = request.POST.get("status")
    if new_status in dict(Task.Status.choices):
        task.status = new_status
        task.save()
    return render(request, "tasks/partials/task_card.html", {"task": task})

@login_required
def task_delete(request, pk):
    get_object_or_404(Task, pk=pk, owner=request.user).delete()
    return HttpResponse("")
```

## Step 4: Templates

```html
<!-- templates/base.html — base template with htmx -->
<!DOCTYPE html>
<html>
<head>
  <title>{% block title %}TaskFlow{% endblock %}</title>
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <style>
    .htmx-indicator { display: none; }
    .htmx-request .htmx-indicator { display: inline; }
    .task-card { border: 1px solid #ddd; padding: 1rem; margin: 0.5rem 0; border-radius: 8px; }
  </style>
</head>
<body><main>{% block content %}{% endblock %}</main></body>
</html>
```

```html
<!-- templates/tasks/index.html — main task page -->
{% extends "base.html" %}
{% block content %}
<h1>My Tasks</h1>

<input type="search" name="q" placeholder="Search..."
  hx-get="{% url 'task-list' %}" hx-trigger="input changed delay:300ms"
  hx-target="#task-list" hx-indicator="#spinner" value="{{ query }}" />
<span id="spinner" class="htmx-indicator">Searching...</span>

<select name="status" hx-get="{% url 'task-list' %}" hx-trigger="change"
  hx-target="#task-list" hx-include="[name='q']">
  <option value="">All</option>
  <option value="todo">To Do</option>
  <option value="in_progress">In Progress</option>
  <option value="done">Done</option>
</select>

<div id="form-container">
  <button hx-get="{% url 'task-create' %}" hx-target="#form-container">+ New Task</button>
</div>

<div id="task-list">{% include "tasks/partials/task_list.html" %}</div>
{% endblock %}
```

```html
<!-- templates/tasks/partials/task_card.html — single task card -->
<div class="task-card" id="task-{{ task.id }}">
  <h3>{{ task.title }}</h3>
  <p>{{ task.description }}</p>
  <select name="status" hx-post="{% url 'task-update-status' task.id %}"
    hx-target="#task-{{ task.id }}" hx-swap="outerHTML">
    {% for value, label in task.Status.choices %}
      <option value="{{ value }}" {% if task.status == value %}selected{% endif %}>{{ label }}</option>
    {% endfor %}
  </select>
  <button hx-delete="{% url 'task-delete' task.id %}" hx-target="#task-{{ task.id }}"
    hx-swap="outerHTML swap:300ms" hx-confirm="Delete '{{ task.title }}'?">Delete</button>
</div>
```

## Step 5: URLs

```python
# tasks/urls.py — URL patterns
from django.urls import path
from . import views

urlpatterns = [
    path("", views.task_list, name="task-list"),
    path("create/", views.task_create, name="task-create"),
    path("<int:pk>/status/", views.task_update_status, name="task-update-status"),
    path("<int:pk>/delete/", views.task_delete, name="task-delete"),
]
```

## Step 6: Run

```bash
# Terminal — start development server
python manage.py makemigrations tasks && python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

## What You've Built

A fully interactive task manager with real-time search, inline status changes, and smooth deletes — all without JavaScript. Django renders HTML fragments, HTMX swaps them in. This pattern scales well for dashboards, admin panels, and CRUD applications.
