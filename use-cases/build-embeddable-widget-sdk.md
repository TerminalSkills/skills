---
title: Build an Embeddable Widget SDK
slug: build-embeddable-widget-sdk
description: Build a JavaScript SDK that lets customers embed interactive widgets (chat, feedback, analytics) on their websites — with iframe isolation, theming, event communication, and zero conflicts with host pages.
skills:
  - typescript
  - hono
  - zod
  - tailwindcss
category: Full-Stack Development
tags:
  - sdk
  - widget
  - embed
  - iframe
  - javascript
---

# Build an Embeddable Widget SDK

## The Problem

Jorge leads product at a 25-person customer feedback company. Customers want to add a feedback widget to their websites — a floating button that opens a form, collects feedback, and submits it. The current approach is a code snippet that injects HTML directly into the customer's DOM. This breaks constantly: CSS conflicts with the host page, React apps re-render and destroy the widget, Content Security Policy blocks inline styles. They need an SDK that works on any website without conflicts, loads asynchronously, and communicates securely with the host page.

## Step 1: Build the Widget Loader

```typescript
// src/sdk/loader.ts — Lightweight loader script (~2KB) customers paste on their site
(function(window: Window, document: Document) {
  const WIDGET_URL = "https://widget.feedback.app";

  interface FeedbackConfig {
    projectId: string;
    position?: "bottom-right" | "bottom-left";
    theme?: "light" | "dark" | "auto";
    primaryColor?: string;
    triggerText?: string;
    userId?: string;
    userEmail?: string;
    metadata?: Record<string, string>;
    onSubmit?: (feedback: any) => void;
    onOpen?: () => void;
    onClose?: () => void;
  }

  class FeedbackWidget {
    private config: FeedbackConfig;
    private iframe: HTMLIFrameElement | null = null;
    private trigger: HTMLButtonElement | null = null;
    private isOpen = false;

    constructor(config: FeedbackConfig) {
      this.config = config;
      this.init();
    }

    private init(): void {
      // Create trigger button (floating action button)
      this.trigger = document.createElement("button");
      this.trigger.id = "feedback-widget-trigger";
      const pos = this.config.position || "bottom-right";
      const color = this.config.primaryColor || "#3B82F6";

      this.trigger.style.cssText = `
        position: fixed; ${pos.includes("right") ? "right: 20px" : "left: 20px"};
        bottom: 20px; z-index: 2147483647; border: none; border-radius: 50%;
        width: 56px; height: 56px; background: ${color}; color: white;
        cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 24px; display: flex; align-items: center; justify-content: center;
        transition: transform 0.2s; font-family: system-ui;
      `;
      this.trigger.textContent = "💬";
      this.trigger.title = this.config.triggerText || "Send Feedback";

      this.trigger.addEventListener("click", () => this.toggle());
      this.trigger.addEventListener("mouseenter", () => { this.trigger!.style.transform = "scale(1.1)"; });
      this.trigger.addEventListener("mouseleave", () => { this.trigger!.style.transform = "scale(1)"; });

      document.body.appendChild(this.trigger);

      // Listen for messages from iframe
      window.addEventListener("message", (e) => this.handleMessage(e));
    }

    toggle(): void {
      this.isOpen ? this.close() : this.open();
    }

    open(): void {
      if (this.iframe) return;

      // Create sandboxed iframe
      this.iframe = document.createElement("iframe");
      const pos = this.config.position || "bottom-right";
      const params = new URLSearchParams({
        projectId: this.config.projectId,
        theme: this.config.theme || "auto",
        primaryColor: this.config.primaryColor || "#3B82F6",
        ...(this.config.userId ? { userId: this.config.userId } : {}),
        ...(this.config.userEmail ? { userEmail: this.config.userEmail } : {}),
      });

      this.iframe.src = `${WIDGET_URL}/widget?${params}`;
      this.iframe.style.cssText = `
        position: fixed; ${pos.includes("right") ? "right: 20px" : "left: 20px"};
        bottom: 90px; z-index: 2147483646; border: none; border-radius: 12px;
        width: 380px; height: 500px; box-shadow: 0 8px 30px rgba(0,0,0,0.12);
        background: white; opacity: 0; transform: translateY(20px);
        transition: opacity 0.3s, transform 0.3s;
      `;
      this.iframe.sandbox.add("allow-scripts", "allow-forms", "allow-same-origin");

      document.body.appendChild(this.iframe);

      // Animate in
      requestAnimationFrame(() => {
        if (this.iframe) {
          this.iframe.style.opacity = "1";
          this.iframe.style.transform = "translateY(0)";
        }
      });

      this.isOpen = true;
      this.config.onOpen?.();
    }

    close(): void {
      if (this.iframe) {
        this.iframe.style.opacity = "0";
        this.iframe.style.transform = "translateY(20px)";
        setTimeout(() => {
          this.iframe?.remove();
          this.iframe = null;
        }, 300);
      }
      this.isOpen = false;
      this.config.onClose?.();
    }

    // Receive messages from widget iframe
    private handleMessage(event: MessageEvent): void {
      if (event.origin !== WIDGET_URL) return;

      switch (event.data.type) {
        case "FEEDBACK_SUBMITTED":
          this.config.onSubmit?.(event.data.feedback);
          // Auto-close after submit
          setTimeout(() => this.close(), 2000);
          break;

        case "WIDGET_RESIZE":
          if (this.iframe) {
            this.iframe.style.height = `${event.data.height}px`;
          }
          break;

        case "WIDGET_CLOSE":
          this.close();
          break;
      }
    }

    // Programmatic API
    identify(userId: string, email?: string, metadata?: Record<string, string>): void {
      this.config.userId = userId;
      if (email) this.config.userEmail = email;
      if (metadata) this.config.metadata = { ...this.config.metadata, ...metadata };

      if (this.iframe) {
        this.iframe.contentWindow?.postMessage({
          type: "IDENTIFY_USER",
          userId, email, metadata,
        }, WIDGET_URL);
      }
    }

    destroy(): void {
      this.close();
      this.trigger?.remove();
      this.trigger = null;
    }
  }

  // Expose to global scope
  (window as any).FeedbackWidget = FeedbackWidget;

  // Auto-init if config exists
  const script = document.currentScript as HTMLScriptElement;
  if (script?.dataset.projectId) {
    (window as any).__feedbackWidget = new FeedbackWidget({
      projectId: script.dataset.projectId,
      position: script.dataset.position as any,
      theme: script.dataset.theme as any,
      primaryColor: script.dataset.color,
    });
  }
})(window, document);
```

## Step 2: Customer Integration

```html
<!-- Simple: one script tag -->
<script
  src="https://widget.feedback.app/sdk.js"
  data-project-id="proj_abc123"
  data-position="bottom-right"
  data-theme="auto"
  data-color="#6366F1"
  async
></script>

<!-- Advanced: programmatic control -->
<script src="https://widget.feedback.app/sdk.js" async></script>
<script>
  window.addEventListener('load', () => {
    const widget = new FeedbackWidget({
      projectId: 'proj_abc123',
      theme: 'dark',
      primaryColor: '#6366F1',
      onSubmit: (feedback) => {
        analytics.track('feedback_submitted', feedback);
      },
    });

    // Identify logged-in user
    widget.identify('user_123', 'alice@example.com', {
      plan: 'pro',
      company: 'Acme Inc'
    });
  });
</script>
```

## Results

- **Zero CSS conflicts** — iframe sandboxes the widget completely; the widget's styles can't affect the host page and vice versa
- **Works on any framework** — React, Vue, Angular, WordPress, static HTML — the iframe doesn't care what the host page uses; no framework-specific SDK needed
- **CSP compatible** — no inline styles or scripts injected into the host page; the widget loads from its own domain
- **2KB loader** — the initial script is tiny; the full widget (iframe content) loads on-demand when the user clicks
- **postMessage communication** — secure cross-origin events let the host page react to submissions, resize the widget, and identify users; no direct DOM access between widget and host
