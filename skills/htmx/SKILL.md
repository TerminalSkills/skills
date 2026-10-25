---
name: htmx
description: |
  htmx gives you access to AJAX, CSS transitions, WebSockets, and Server-Sent Events
  directly in HTML using attributes. It enables dynamic web UIs without writing JavaScript
  by letting any element issue HTTP requests and swap content into the DOM.
license: Apache-2.0
compatibility: 'any web server, html'
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/bigskysoftware/htmx
  category: development
  tags: "html, hypermedia, ajax, sse"
---

# htmx

htmx extends HTML with attributes like `hx-get`, `hx-post`, `hx-swap`, and `hx-trigger` to make any element capable of issuing HTTP requests and updating the DOM. The server returns HTML fragments, not JSON.

## Overview

htmx 2.x lets plain HTML attributes issue AJAX requests, listen for events and swap server-rendered fragments into the page. Use it for server-rendered apps (Django, Rails, Go, Express) that need partial updates, search-as-you-type, infinite scroll, polling or live streams, without a JavaScript framework.

## Instructions

### Installation

```html
<!-- index.html — htmx 2.0.11 from a CDN, pinned with an integrity hash (hash from the htmx docs) -->
<script src="https://cdn.jsdelivr.net/npm/htmx.org@2.0.11/dist/htmx.min.js"
  integrity="sha384-2OatzQy1H+Zd/IIrjr1TcuDGqLXeHhbooAyJY1KdQMKnr4LZ22k31GBLdYKHmVjg"
  crossorigin="anonymous"></script>
```

`htmx.org@latest` on npm is 2.x; 4.0 is published only under the `next` tag and changes defaults, so pin 2.x unless you are migrating on purpose. SSE and WebSocket support are no longer in core: they are separate packages (`htmx-ext-sse`, `htmx-ext-ws`) loaded after htmx (see below).

By default htmx does not swap 4xx and 5xx responses, so a `422` validation-error fragment is silently dropped. To swap it, add to `<head>`:

```html
<meta name="htmx-config" content='{"responseHandling":[{"code":"204","swap":false},{"code":"[23]..","swap":true},{"code":"422","swap":true},{"code":"[45]..","swap":false,"error":true},{"code":"...","swap":true}]}' />
```

### Core Attributes

```html
<!-- templates/core-demo.html — fundamental htmx attributes -->

<!-- GET request, replace inner HTML of target -->
<button hx-get="/api/articles" hx-target="#article-list" hx-swap="innerHTML">
  Load Articles
</button>
<div id="article-list"></div>

<!-- POST form without page reload -->
<form id="article-form" hx-post="/api/articles" hx-target="#article-list" hx-swap="afterbegin">
  <input name="title" placeholder="Title" required />
  <textarea name="body" placeholder="Body" required></textarea>
  <button type="submit">Create</button>
</form>

<!-- DELETE with confirmation -->
<button hx-delete="/api/articles/42" hx-confirm="Are you sure?" hx-target="closest article" hx-swap="outerHTML swap:500ms">
  Delete
</button>
```

### Swap Strategies

```html
<!-- templates/swap-strategies.html — different ways to insert content -->

<!-- Replace inner content (default) -->
<div hx-get="/fragment" hx-swap="innerHTML">Replace my contents</div>

<!-- Replace entire element -->
<div hx-get="/fragment" hx-swap="outerHTML">Replace me entirely</div>

<!-- Append/prepend to list -->
<div id="list">
  <button hx-get="/more" hx-target="#list" hx-swap="beforeend">Load More</button>
</div>

<!-- Out-of-band swaps (update multiple elements) -->
<!-- Server returns: -->
<!-- <div id="notification" hx-swap-oob="innerHTML">New notification!</div> -->
<!-- <div id="count" hx-swap-oob="innerHTML">43</div> -->
```

### Triggers

```html
<!-- templates/triggers.html — custom event triggers -->

<!-- Trigger on input change with debounce -->
<input type="search" name="q"
  hx-get="/search"
  hx-trigger="input changed delay:300ms"
  hx-target="#results" />
<div id="results"></div>

<!-- Trigger on intersection (lazy loading) -->
<div hx-get="/more-articles"
  hx-trigger="intersect once"
  hx-swap="afterend">
  Loading...
</div>

<!-- Trigger on custom event -->
<div hx-get="/notifications" hx-trigger="newMessage from:body">
  Notifications
</div>

<!-- Polling -->
<div hx-get="/api/status" hx-trigger="every 5s">
  Status: checking...
</div>
```

### Server Responses (Python/Django Example)

```python
# views.py — server returns HTML fragments, not JSON
from django.shortcuts import render
from django.http import HttpResponse

def article_list(request):
    articles = Article.objects.filter(published=True)[:20]
    return render(request, "partials/article_list.html", {"articles": articles})

def create_article(request):
    form = ArticleForm(request.POST)
    if form.is_valid():
        article = form.save()
        return render(request, "partials/article_card.html", {"article": article})
    response = render(request, "partials/article_form.html", {"form": form}, status=422)
    response["HX-Retarget"] = "#article-form"
    response["HX-Reswap"] = "outerHTML"
    return response

def delete_article(request, pk):
    Article.objects.filter(pk=pk).delete()
    return HttpResponse("")  # 200 + empty body removes the element with outerHTML; a 204 is never swapped
```

```html
<!-- templates/partials/article_card.html — HTML fragment returned by server -->
<article id="article-{{ article.id }}">
  <h2>{{ article.title }}</h2>
  <p>{{ article.body|truncatewords:30 }}</p>
  <button hx-delete="/api/articles/{{ article.id }}"
    hx-target="#article-{{ article.id }}"
    hx-swap="outerHTML swap:300ms"
    hx-confirm="Delete this article?">
    Delete
  </button>
</article>
```

### Indicators

```html
<!-- templates/indicators.html — loading indicators -->

<!-- Show spinner during request -->
<button hx-get="/slow-endpoint" hx-indicator="#spinner">
  Load Data
</button>
<span id="spinner" class="htmx-indicator">Loading...</span>

<!-- CSS (htmx adds .htmx-request class during requests) -->
<style>
  .htmx-indicator { display: none; }
  .htmx-request .htmx-indicator { display: inline; }
  .htmx-request.htmx-indicator { display: inline; }
</style>
```

### Headers and Request Config

```html
<!-- templates/request-config.html — request customization -->

<!-- Include extra values -->
<button hx-post="/api/vote" hx-vals='{"article_id": 42, "vote": "up"}'>
  Upvote
</button>

<!-- Include values from other elements -->
<input id="search-input" name="q" />
<button hx-get="/search" hx-include="#search-input">Search</button>

<!-- Push URL to browser history -->
<a hx-get="/articles/my-article" hx-push-url="true" hx-target="#content">
  My Article
</a>
```

### Server-Sent Events

```html
<!-- templates/sse.html — real-time updates with SSE -->
<!-- load after htmx: <script src="https://cdn.jsdelivr.net/npm/htmx-ext-sse@2.2.4/dist/sse.min.js"></script> -->
<div hx-ext="sse" sse-connect="/events/articles">
  <div sse-swap="newArticle" hx-swap="afterbegin">
    <!-- New articles appear here in real-time -->
  </div>
</div>
```

```python
# views.py — SSE endpoint
from django.http import StreamingHttpResponse
from django.template.loader import render_to_string

def article_events(request):
    def event_stream():
        for article in listen_for_new_articles():  # your own blocking generator
            html = render_to_string("partials/article_card.html", {"article": article})
            # every line of a multi-line payload needs its own "data:" prefix
            data = "\n".join(f"data: {line}" for line in html.splitlines())
            yield f"event: newArticle\n{data}\n\n"
    return StreamingHttpResponse(event_stream(), content_type="text/event-stream")
```

### WebSocket

```html
<!-- templates/ws.html — WebSocket integration -->
<!-- load after htmx: <script src="https://cdn.jsdelivr.net/npm/htmx-ext-ws@2.0.4/dist/ws.min.js"></script> -->
<div hx-ext="ws" ws-connect="/ws/chat">
  <div id="messages"></div>
  <form id="chat-form" ws-send>
    <input name="message" placeholder="Type a message..." />
    <button type="submit">Send</button>
  </form>
</div>
```

### Boosting (Progressive Enhancement)

```html
<!-- templates/boost.html — make regular links/forms use AJAX -->
<body hx-boost="true">
  <!-- All links and forms in this body now use AJAX -->
  <nav>
    <a href="/articles">Articles</a>  <!-- AJAX navigation -->
    <a href="/about">About</a>
  </nav>
  <main id="content">
    <!-- Content swapped here -->
  </main>
</body>
```

### CSRF and Security

```html
<!-- Django: send the CSRF token with every htmx request -->
<body hx-headers='{"X-CSRFToken": "{{ csrf_token }}"}'>
```

- Escape user data in every fragment you return (Django and Jinja2 autoescape by default); htmx inserts the HTML as given.
- Keep `htmx.config.selfRequestsOnly` at its default `true` unless you must call other origins, and set `allowEval` to `false` if your CSP forbids `eval` (this disables trigger filters).
- Detect htmx calls on the server with the `HX-Request: true` header, and return a full page otherwise. Add `Vary: HX-Request` when a URL serves both.

### Key Patterns

- Server returns HTML fragments, not JSON — this is hypermedia, not REST
- Use `hx-target` to control where responses are inserted; `hx-swap` controls how
- Use `hx-trigger` with modifiers (`delay`, `throttle`, `changed`, `once`) for precise control
- Use `hx-boost="true"` on `<body>` for easy progressive enhancement of existing sites
- Use `hx-swap-oob` for updating multiple page sections from a single response
- Use `hx-push-url` for back-button support

## Examples

### Example 1: Live search box

**User request:** "Add search-as-you-type to the articles page without writing JavaScript"

Use the debounced `input changed delay:300ms` trigger from the Triggers section on the `search` input, return only the matching result rows from `/search?q=...`, and target `#results`. Typing "django" sends one request after 300 ms of silence, and the list updates in place.

### Example 2: Inline delete with validation errors

**User request:** "Delete an article from the list and show form errors without a reload"

Use the `hx-delete` card with `hx-target="#article-42"` and `outerHTML` swap; the view returns 200 with an empty body, so the card disappears. For the create form, return the form with status 422 (the view sets `HX-Retarget`/`HX-Reswap` so it replaces the form, not the list) and enable 422 swapping with the `htmx-config` meta tag from Installation, otherwise the errors never appear.

## Guidelines

- Pin the htmx version and use an integrity hash; do not load `latest`.
- 4xx/5xx responses are not swapped by default; configure `responseHandling` or use the `response-targets` extension for error fragments.
- A 204 response never swaps; return 200 with an empty body to clear an element.
- Always escape user data in fragments, and send the CSRF token with `hx-headers`.
