---
name: hotwire
description: >-
  Build server-rendered web apps that feel like SPAs with Hotwire, the HTML-over-the-wire
  toolkit made of Turbo (Drive, Frames, Streams, page-refresh morphing) and Stimulus
  controllers. Use when a user asks to "add Turbo", "use Hotwire", "update part of a page
  without a full reload", "live-update with Turbo Streams", "write a Stimulus controller",
  or wants SPA-like navigation from Rails, Django, Laravel, Express or Go without a
  JavaScript framework.
license: Apache-2.0
compatibility: "@hotwired/turbo 8.x and @hotwired/stimulus 3.x, any backend that renders HTML; Rails 7+ via turbo-rails and importmap"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: "https://github.com/hotwired/turbo"
  category: development
  tags: "hotwire, turbo, stimulus, server-rendered, html-over-the-wire"
---

# Hotwire — HTML Over the Wire

## Overview

Hotwire sends HTML from the server instead of JSON and lets the browser patch it in. It has two parts: Turbo (Drive for navigation, Frames for independent page regions, Streams for targeted DOM changes, and morphing page refreshes) and Stimulus (small controllers attached with `data-*` attributes). Current packages: `@hotwired/turbo` 8.0.x and `@hotwired/stimulus` 3.2.x. Rails apps get both through `turbo-rails` and `stimulus-rails`; other backends only need to return HTML and set the right status codes and content types.

## Instructions

### Step 1: Install

```bash
npm install @hotwired/turbo @hotwired/stimulus
# Rails 7+ with importmap
bin/importmap pin @hotwired/turbo-rails @hotwired/stimulus
```

```javascript
// app.js
import "@hotwired/turbo";                 // starts Turbo Drive; no setup call needed
import { Application } from "@hotwired/stimulus";
import DropdownController from "./controllers/dropdown_controller.js";

window.Stimulus = Application.start();
Stimulus.register("dropdown", DropdownController);
```

### Step 2: Turbo Drive

Drive is on as soon as the script loads: link clicks and form submissions become fetch requests and only the `<body>` is swapped, with `<head>` assets kept.

```html
<a href="/invoices/export.csv" data-turbo="false">Download CSV</a>   <!-- opt out -->
<a href="/articles/7/edit" data-turbo-action="replace">Edit</a>        <!-- replace history entry -->
<a href="/about" data-turbo-prefetch="false">About</a>                <!-- no hover prefetch -->
<meta name="turbo-cache-control" content="no-cache">                  <!-- never cache this page -->
```

Since Turbo 8, links are prefetched 100 ms after hover by default; disable it for the page with `<meta name="turbo-prefetch" content="false">`. `data-turbo-permanent` on an element with an `id` keeps it across navigations. A form `POST` must be answered with a `303` redirect on success and `422` (validation errors) or `500` with the re-rendered form on failure; a `200` after a POST is ignored by Drive and the page appears to do nothing.

### Step 3: Turbo Frames

A `turbo-frame` element scopes navigation: links and forms inside it update only that frame, and the response must contain a frame with the same `id`.

```html
<turbo-frame id="comments">
  <h2>Comments</h2>
  <a href="/posts/7/comments?page=2">More</a>   <!-- response must contain a turbo-frame with id="comments" -->
</turbo-frame>

<turbo-frame id="activity" src="/posts/7/activity" loading="lazy">
  <p>Loading activity…</p>
</turbo-frame>

<a href="/posts/7" data-turbo-frame="_top">Open full page</a>        <!-- break out of the frame -->
<a href="/users/42" data-turbo-frame="profile-panel">View profile</a> <!-- drive another frame -->
```

### Step 4: Turbo Streams

A stream is a `turbo-stream` element with an `action` and a `target` (an element id) or `targets` (a CSS selector). Actions: `append`, `prepend`, `replace`, `update`, `remove`, `before`, `after`, `refresh`.

```html
<turbo-stream action="append" target="comments">
  <template><div id="comment_58" class="comment"><strong>Maria:</strong> Shipped it.</div></template>
</turbo-stream>
<turbo-stream action="remove" target="comment_57"></turbo-stream>
<turbo-stream action="update" target="unread-count"><template>5</template></turbo-stream>
```

Delivery:

- In response to a non-GET form submission: Turbo adds `text/vnd.turbo-stream.html` to the `Accept` header; reply with that content type and the stream elements. Links and GET forms need `data-turbo-stream` to ask for it.
- Over WebSocket or SSE: put a `turbo-stream-source` element (`src` is a `wss://` or SSE URL) in the page and send stream elements down it. Rails does this with `turbo_stream_from` and `broadcast_*` helpers over Action Cable.

### Step 5: Page refreshes with morphing

Turbo 8 can re-render the same page by morphing instead of replacing the body, which keeps scroll, focus and open popovers:

```html
<head>
  <meta name="turbo-refresh-method" content="morph">
  <meta name="turbo-refresh-scroll" content="preserve">
</head>
```

Mark elements Turbo must not touch with `data-turbo-permanent`. Send a stream with `action="refresh"` to make every viewer reload the current page, and a frame with `refresh="morph"` reloads just itself on refresh.

### Step 6: Stimulus controllers

```javascript
// controllers/dropdown_controller.js
import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["menu"];
  static values = { open: Boolean };
  static classes = ["active"];

  toggle() { this.openValue = !this.openValue; }

  openValueChanged() {
    this.menuTarget.classList.toggle(this.activeClass, this.openValue);
    this.menuTarget.hidden = !this.openValue;
  }

  closeOutside(event) {
    if (!this.element.contains(event.target)) this.openValue = false;
  }
}
```

```html
<div data-controller="dropdown" data-dropdown-active-class="shadow-lg"
     data-action="click@window->dropdown#closeOutside">
  <button data-action="dropdown#toggle">Account</button>
  <ul data-dropdown-target="menu" hidden>
    <li><a href="/settings">Settings</a></li>
  </ul>
</div>
```

Controllers connect and disconnect automatically when Turbo adds or removes their elements, so no manual re-initialization after navigation or stream updates.

## Examples

### Example 1: Add a comment without a page reload

Request: "When someone posts a comment, append it to the list and clear the form, no full reload."

Server (Express, form posted by Turbo):

```javascript
app.post("/posts/:id/comments", express.urlencoded({ extended: false }), (req, res) => {
  const comment = saveComment(req.params.id, req.body.body);
  if (!comment) return res.status(422).send(renderPost(req.params.id, { error: "Comment can't be blank" }));
  if ((req.get("Accept") || "").includes("text/vnd.turbo-stream.html")) {  // req.accepts() would also match a plain browser's */*
    res.type("text/vnd.turbo-stream.html").send(`
      <turbo-stream action="append" target="comments"><template>
        <div id="comment_${comment.id}" class="comment"><strong>${esc(comment.author)}:</strong> ${esc(comment.body)}</div>
      </template></turbo-stream>
      <turbo-stream action="replace" target="new_comment"><template>
        <form id="new_comment" action="/posts/${req.params.id}/comments" method="post"><textarea name="body"></textarea><button>Post</button></form>
      </template></turbo-stream>`);
  } else {
    res.redirect(303, `/posts/${req.params.id}`);
  }
});
```

Result: the new comment appears at the end of `#comments`, the form is reset, and clients without Turbo still get a normal redirect. Escape user text (`esc`) before putting it in HTML.

### Example 2: Inline edit inside a frame

Request: "Let users edit a note in place."

```html
<turbo-frame id="note_12">
  <p>Call the supplier before Friday.</p>
  <a href="/notes/12/edit">Edit</a>
</turbo-frame>
```

`GET /notes/12/edit` returns only a `turbo-frame` with id `note_12` containing the form. Submitting it answers `303` to `/notes/12`, which returns the frame again with the new text. The rest of the page is untouched.

## Guidelines

- Always return `303` after a successful form POST and `422` with the form for validation errors; this is the most common reason "Turbo does nothing".
- A response without a frame of the same `id` shows "Content missing" in the frame; check the server returns the same frame id.
- Only elements with an `id` can be stream targets; give list containers and items stable ids (`comment_58`).
- Escape all user content in stream HTML and do not accept stream posts from untrusted sources; a stream can replace any element on the page.
- Stimulus is for behavior (toggles, clipboard, form helpers), not for rendering lists; render on the server.
- Third-party widgets that change the DOM need `data-turbo-permanent` or a Stimulus controller that rebuilds them on `connect`.
- Pair with `turbo-rails` for Rails; for other backends nothing else is required, but WebSocket broadcasting is yours to build.
