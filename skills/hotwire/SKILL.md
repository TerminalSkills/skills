---
name: hotwire
description: >-
   You are an expert in Hotwire (HTML Over The Wire), the collection of
  techniques for building modern web applications by sending HTML instead of
  JSON. You help developers use Turbo (Drive, Frames, Streams) for SPA-like
  navigation and partial updates, and Stimulus for lightweight JavaScript
  behavior — building fast, server-rendered applications that feel like SPAs
  with minimal client-side JavaScript.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Web Frameworks
  tags:
    - html-over-the-wire
    - turbo
    - stimulus
    - server-rendered
    - rails
    - django
    - low-javascript
---

# Hotwire — HTML Over the Wire

You are an expert in Hotwire (HTML Over The Wire), the collection of techniques for building modern web applications by sending HTML instead of JSON. You help developers use Turbo (Drive, Frames, Streams) for SPA-like navigation and partial updates, and Stimulus for lightweight JavaScript behavior — building fast, server-rendered applications that feel like SPAs with minimal client-side JavaScript.

## Core Capabilities

### Turbo Drive (SPA-like navigation)

```html
<!-- Turbo Drive is automatic — no configuration needed -->
<!-- All link clicks and form submissions are intercepted -->
<!-- Only the <body> is replaced; <head> assets are preserved -->

<!-- Opt out specific links -->
<a href="/external" data-turbo="false">External Link</a>

<!-- Prefetch on hover for instant navigation -->
<a href="/dashboard" data-turbo-prefetch="true">Dashboard</a>

<!-- Progress bar appears automatically during navigation -->
<style>
  .turbo-progress-bar {
    background-color: #6366f1;
    height: 3px;
  }
</style>
```

### Turbo Frames (partial page updates)

```html
<!-- Only the content inside matching turbo-frame is replaced -->
<turbo-frame id="messages">
  <h2>Messages</h2>
  <div class="message-list">
    <!-- Messages rendered server-side -->
    <div class="message">Hello from server!</div>
  </div>
  <!-- This link only updates THIS frame -->
  <a href="/messages?page=2">Load more</a>
</turbo-frame>

<!-- Lazy-loaded frame (loads on page appear) -->
<turbo-frame id="notifications" src="/notifications" loading="lazy">
  <p>Loading notifications...</p>
</turbo-frame>

<!-- Frame that targets another frame -->
<turbo-frame id="sidebar">
  <a href="/users/42" data-turbo-frame="main-content">View Profile</a>
</turbo-frame>
<turbo-frame id="main-content">
  <!-- Profile loads here -->
</turbo-frame>
```

### Turbo Streams (real-time updates)

```html
<!-- Server sends these HTML snippets to update the page -->
<!-- Via form response, WebSocket, or SSE -->

<!-- Append a new message to the list -->
<turbo-stream action="append" target="messages">
  <template>
    <div id="message_42" class="message">
      <strong>Alice:</strong> New message just arrived!
    </div>
  </template>
</turbo-stream>

<!-- Replace an existing element -->
<turbo-stream action="replace" target="message_42">
  <template>
    <div id="message_42" class="message edited">
      <strong>Alice:</strong> Edited message content
    </div>
  </template>
</turbo-stream>

<!-- Remove an element -->
<turbo-stream action="remove" target="message_42"></turbo-stream>

<!-- Update element content (keep the wrapper) -->
<turbo-stream action="update" target="unread-count">
  <template>5</template>
</turbo-stream>

<!-- Available actions: append, prepend, replace, update, remove, before, after -->
```

### Stimulus (lightweight JS behavior)

```javascript
// src/controllers/dropdown_controller.js
import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["menu"];              // data-dropdown-target="menu"
  static values = { open: Boolean };      // data-dropdown-open-value="false"
  static classes = ["active"];            // data-dropdown-active-class="opacity-100"

  toggle() {
    this.openValue = !this.openValue;
  }

  openValueChanged() {
    this.menuTarget.classList.toggle(this.activeClass, this.openValue);
    this.menuTarget.classList.toggle("hidden", !this.openValue);
  }

  // Close on click outside
  close(event) {
    if (!this.element.contains(event.target)) {
      this.openValue = false;
    }
  }
}
```

```html
<!-- HTML with Stimulus controller -->
<div data-controller="dropdown"
     data-dropdown-active-class="opacity-100"
     data-action="click@window->dropdown#close">
  <button data-action="dropdown#toggle">Menu ▾</button>
  <ul data-dropdown-target="menu" class="hidden">
    <li><a href="/profile">Profile</a></li>
    <li><a href="/settings">Settings</a></li>
    <li><a href="/logout">Logout</a></li>
  </ul>
</div>
```

## Installation

```bash
# With import maps (Rails 7+, no bundler)
bin/importmap pin @hotwired/turbo @hotwired/stimulus

# With npm
npm install @hotwired/turbo @hotwired/stimulus

# JavaScript setup
import * as Turbo from "@hotwired/turbo";
import { Application } from "@hotwired/stimulus";
const application = Application.start();
```

## Best Practices

1. **Server-first** — Render HTML on the server; Turbo handles making it feel like an SPA
2. **Frames for partials** — Use Turbo Frames to update sections independently; no full-page reloads needed
3. **Streams for real-time** — Use Turbo Streams over WebSocket/SSE for live updates (chat, notifications, dashboards)
4. **Stimulus for behavior** — Only add JS for interactive behavior (dropdowns, modals, form validation); not for rendering
5. **Minimal JavaScript** — A typical Hotwire app has 10-20 small Stimulus controllers vs. 500+ React components
6. **Progressive enhancement** — Everything works without JavaScript; Turbo enhances with speed, Stimulus adds behavior
7. **Works with any backend** — Designed for Rails but works with Django, Laravel, Express, Go — any server that renders HTML
8. **Cache effectively** — Turbo caches pages; use `data-turbo-cache="false"` on pages that should never be cached
