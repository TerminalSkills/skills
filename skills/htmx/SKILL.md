---
name: htmx
description: |
  htmx gives you access to AJAX, CSS transitions, WebSockets, and Server-Sent Events
  directly in HTML using attributes. It enables dynamic web UIs without writing JavaScript
  by letting any element issue HTTP requests and swap content into the DOM.
license: Apache-2.0
compatibility:
  - any web server
  - html
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frameworks
  tags:
    - html
    - hypermedia
    - ajax
    - sse
    - websocket
    - no-javascript
---

# htmx

htmx extends HTML with attributes like `hx-get`, `hx-post`, `hx-swap`, and `hx-trigger` to make any element issue HTTP requests and update the DOM. The server returns HTML fragments, not JSON.

## Installation

```html
<!-- index.html — add htmx via CDN -->
<script src="https://unpkg.com/htmx.org@2.0.4"></script>
```

## Core Attributes

```html
<!-- templates/core.html — fundamental htmx attributes -->
<button hx-get="/api/articles" hx-target="#list" hx-swap="innerHTML">Load</button>
<div id="list"></div>

<!-- POST form without page reload -->
<form hx-post="/api/articles" hx-target="#list" hx-swap="afterbegin">
  <input name="title" required />
  <textarea name="body" required></textarea>
  <button type="submit">Create</button>
</form>

<!-- DELETE with confirmation -->
<button hx-delete="/api/articles/42" hx-confirm="Sure?" hx-target="closest article" hx-swap="outerHTML swap:500ms">
  Delete
</button>
```

## Swap Strategies

```html
<!-- templates/swaps.html — different insertion methods -->
<div hx-get="/fragment" hx-swap="innerHTML">Replace contents</div>
<div hx-get="/fragment" hx-swap="outerHTML">Replace entire element</div>
<div id="list">
  <button hx-get="/more" hx-target="#list" hx-swap="beforeend">Load More</button>
</div>

<!-- Out-of-band swaps — update multiple elements from one response -->
<!-- Server returns: <div id="count" hx-swap-oob="innerHTML">43</div> -->
```

## Triggers

```html
<!-- templates/triggers.html — custom event triggers -->
<input type="search" name="q"
  hx-get="/search" hx-trigger="input changed delay:300ms" hx-target="#results" />
<div id="results"></div>

<!-- Lazy loading on scroll -->
<div hx-get="/more" hx-trigger="intersect once" hx-swap="afterend">Loading...</div>

<!-- Polling -->
<div hx-get="/api/status" hx-trigger="every 5s">Status: checking...</div>
```

## Server Responses (Python Example)

```python
# views.py — server returns HTML fragments, not JSON
def article_list(request):
    articles = Article.objects.filter(published=True)[:20]
    return render(request, "partials/article_list.html", {"articles": articles})

def create_article(request):
    form = ArticleForm(request.POST)
    if form.is_valid():
        article = form.save()
        return render(request, "partials/article_card.html", {"article": article})
    return render(request, "partials/article_form.html", {"form": form}, status=422)

def delete_article(request, pk):
    Article.objects.filter(pk=pk).delete()
    return HttpResponse("")  # Empty = element removed with outerHTML swap
```

```html
<!-- templates/partials/article_card.html — HTML fragment returned by server -->
<article id="article-{{ article.id }}">
  <h2>{{ article.title }}</h2>
  <p>{{ article.body|truncatewords:30 }}</p>
  <button hx-delete="/api/articles/{{ article.id }}"
    hx-target="#article-{{ article.id }}" hx-swap="outerHTML swap:300ms"
    hx-confirm="Delete?">Delete</button>
</article>
```

## Indicators

```html
<!-- templates/indicators.html — loading states -->
<button hx-get="/slow" hx-indicator="#spinner">Load</button>
<span id="spinner" class="htmx-indicator">Loading...</span>

<style>
  .htmx-indicator { display: none; }
  .htmx-request .htmx-indicator { display: inline; }
  .htmx-request.htmx-indicator { display: inline; }
</style>
```

## Server-Sent Events

```html
<!-- templates/sse.html — real-time updates with SSE -->
<div hx-ext="sse" sse-connect="/events/articles">
  <div sse-swap="newArticle" hx-swap="afterbegin"></div>
</div>
```

## WebSocket

```html
<!-- templates/ws.html — WebSocket integration -->
<div hx-ext="ws" ws-connect="/ws/chat">
  <div id="messages"></div>
  <form ws-send>
    <input name="message" />
    <button type="submit">Send</button>
  </form>
</div>
```

## Boosting

```html
<!-- templates/boost.html — make all links/forms use AJAX -->
<body hx-boost="true">
  <nav>
    <a href="/articles">Articles</a>
    <a href="/about">About</a>
  </nav>
  <main id="content"></main>
</body>
```

## Key Patterns

- Server returns HTML fragments, not JSON — this is hypermedia
- Use `hx-target` to control where responses go; `hx-swap` controls how
- Use `hx-trigger` modifiers (`delay`, `throttle`, `changed`, `once`) for control
- Use `hx-boost="true"` on `<body>` for progressive enhancement
- Use `hx-swap-oob` for updating multiple page sections from one response
- Use `hx-push-url` to update browser URL for back-button support
