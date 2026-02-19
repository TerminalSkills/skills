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

Django excels at rendering HTML server-side. HTMX extends that model by letting the server return HTML fragments that get swapped into the page dynamically. Together, they deliver the responsiveness of an SPA while keeping all logic on the server. No API serialization, no client-side state management, no JavaScript framework to maintain.

## Step 1: Project Setup

Start by creating the Django project with PostgreSQL as the database.

```bash
# Terminal — create project and install dependencies
mkdir taskflow && cd taskflow
python -m venv venv
source venv/bin/activate
pip install django psycopg2-binary django-htmx
django-admin startproject config .
python manage.py startapp tasks
```

Configure the database and installed apps:

```python
# config/settings.py — essential configuration
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django_htmx",
    "tasks",
]

MIDDLEWARE = [
    # ... default middleware ...
    "django_htmx.middleware.HtmxMiddleware",  # Add after CommonMiddleware
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "taskflow",
        "USER": "postgres",
        "PASSWORD": "",
        "HOST": "localhost",
    }
}
```

## Step 2: Define the Model

Create a Task model with status tracking:

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

    def __str__(self):
        return self.title
```

```bash
# Terminal — create and run migrations
python manage.py makemigrations tasks
python manage.py migrate
```

## Step 3: Build the Views

The key insight: views return either a full page (for initial loads) or an HTML fragment (for HTMX requests). The `django-htmx` middleware adds `request.htmx` to detect HTMX requests.

```python
# tasks/views.py — views returning full pages or HTML fragments
from django.shortcuts import render, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from .models import Task
from .forms import TaskForm

@login_required
def task_list(request):
    tasks = Task.objects.filter(owner=request.user)

    # Handle search via HTMX
    query = request.GET.get("q", "")
    if query:
        tasks = tasks.filter(title__icontains=query)

    status_filter = request.GET.get("status", "")
    if status_filter:
        tasks = tasks.filter(status=status_filter)

    context = {"tasks": tasks, "query": query, "status_filter": status_filter}

    # Return just the list fragment for HTMX requests
    if request.htmx:
        return render(request, "tasks/partials/task_list.html", context)
    return render(request, "tasks/index.html", context)

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
    form = TaskForm()
    return render(request, "tasks/partials/task_form.html", {"form": form})

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
    task = get_object_or_404(Task, pk=pk, owner=request.user)
    task.delete()
    return HttpResponse("")  # Empty response removes element
```

## Step 4: Create the Templates

The base template loads htmx and provides the page structure:

```html
<!-- templates/base.html — base template with htmx loaded -->
<!DOCTYPE html>
<html>
<head>
  <title>{% block title %}TaskFlow{% endblock %}</title>
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <style>
    .htmx-indicator { display: none; }
    .htmx-request .htmx-indicator { display: inline; }
    .task-card { border: 1px solid #ddd; padding: 1rem; margin: 0.5rem 0; border-radius: 8px; }
    .status-todo { border-left: 4px solid #f59e0b; }
    .status-in_progress { border-left: 4px solid #3b82f6; }
    .status-done { border-left: 4px solid #10b981; }
  </style>
</head>
<body>
  <main>{% block content %}{% endblock %}</main>
</body>
</html>
```

The main page with search and task list:

```html
<!-- templates/tasks/index.html — main task page -->
{% extends "base.html" %}
{% block content %}
<h1>My Tasks</h1>

<!-- Live search with debounce -->
<input type="search" name="q" placeholder="Search tasks..."
  hx-get="{% url 'task-list' %}"
  hx-trigger="input changed delay:300ms"
  hx-target="#task-list"
  hx-indicator="#search-spinner"
  value="{{ query }}" />
<span id="search-spinner" class="htmx-indicator">Searching...</span>

<!-- Status filter -->
<select name="status"
  hx-get="{% url 'task-list' %}"
  hx-trigger="change"
  hx-target="#task-list"
  hx-include="[name='q']">
  <option value="">All</option>
  <option value="todo">To Do</option>
  <option value="in_progress">In Progress</option>
  <option value="done">Done</option>
</select>

<!-- New task form -->
<div id="task-form-container">
  <button hx-get="{% url 'task-create' %}" hx-target="#task-form-container" hx-swap="innerHTML">
    + New Task
  </button>
</div>

<!-- Task list -->
<div id="task-list">
  {% include "tasks/partials/task_list.html" %}
</div>
{% endblock %}
```

The partial templates that htmx swaps in:

```html
<!-- templates/tasks/partials/task_list.html — task list fragment -->
{% for task in tasks %}
  {% include "tasks/partials/task_card.html" %}
{% empty %}
  <p>No tasks found.</p>
{% endfor %}
```

```html
<!-- templates/tasks/partials/task_card.html — single task card fragment -->
<div class="task-card status-{{ task.status }}" id="task-{{ task.id }}">
  <h3>{{ task.title }}</h3>
  <p>{{ task.description }}</p>

  <!-- Status change dropdown -->
  <select name="status"
    hx-post="{% url 'task-update-status' task.id %}"
    hx-target="#task-{{ task.id }}"
    hx-swap="outerHTML">
    {% for value, label in task.Status.choices %}
      <option value="{{ value }}" {% if task.status == value %}selected{% endif %}>{{ label }}</option>
    {% endfor %}
  </select>

  <!-- Delete button -->
  <button hx-delete="{% url 'task-delete' task.id %}"
    hx-target="#task-{{ task.id }}"
    hx-swap="outerHTML swap:300ms"
    hx-confirm="Delete '{{ task.title }}'?">
    Delete
  </button>
</div>
```

```html
<!-- templates/tasks/partials/task_form.html — inline form fragment -->
<form hx-post="{% url 'task-create' %}" hx-target="#task-list" hx-swap="afterbegin">
  {{ form.as_p }}
  <button type="submit">Create Task</button>
  <button type="button" onclick="this.closest('form').outerHTML = '<button hx-get=&quot;{% url \'task-create\' %}&quot; hx-target=&quot;#task-form-container&quot; hx-swap=&quot;innerHTML&quot;>+ New Task</button>'">Cancel</button>
</form>
```

## Step 5: Wire Up URLs

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

```python
# config/urls.py — root URL config
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("tasks.urls")),
]
```

## Step 6: Run and Test

```bash
# Terminal — start the development server
python manage.py createsuperuser
python manage.py runserver
```

Open `http://localhost:8000` and you'll have a fully interactive task manager. Search filters tasks in real-time with debounce. Status changes happen inline. New tasks appear at the top without a page reload. Deletes fade out with a transition. All with zero JavaScript.

## What You've Built

This pattern — Django rendering HTML fragments, HTMX swapping them into the page — scales remarkably well. You get the developer experience of server-side rendering (one language, one codebase, no API layer) with the user experience of an SPA. The same approach works for dashboards, admin panels, CRUD apps, and content management systems.
