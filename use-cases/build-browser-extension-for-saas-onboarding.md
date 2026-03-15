---
title: Build a Browser Extension for SaaS User Onboarding
slug: build-browser-extension-for-saas-onboarding
description: Build a Chrome extension that provides in-app guided tours, contextual tooltips, and feature announcements — improving activation rates without shipping custom onboarding UI in every product release.
skills:
  - typescript
  - tailwindcss
  - vitest
  - zod
category: development
tags:
  - browser-extension
  - onboarding
  - user-activation
  - chrome-extension
  - product-led-growth
---

# Build a Browser Extension for SaaS User Onboarding

## The Problem

Nina runs growth at a 30-person project management SaaS. The product has powerful features — custom workflows, automation rules, time tracking, integrations — but only 28% of trial users activate (complete 3 key actions) within the first week. User research shows people get overwhelmed by the UI and never discover core features. The engineering team spent 2 months building an in-app tour system, but it's tightly coupled to the frontend and breaks every time the UI changes. A browser extension approach would decouple onboarding from the product codebase, letting the growth team iterate on tours without engineering releases.

## Step 1: Set Up the Extension Architecture

The extension injects a content script that overlays onboarding UI on top of the SaaS product. A background service worker manages tour state and syncs progress with the backend.

```typescript
// manifest.json — Chrome extension manifest (Manifest V3)
{
  "manifest_version": 3,
  "name": "ProductTour — Guided Onboarding",
  "version": "1.0.0",
  "description": "Interactive guided tours for product onboarding",
  
  "permissions": [
    "storage",        // persist tour progress locally
    "activeTab"       // access the current tab for element targeting
  ],
  
  "content_scripts": [
    {
      "matches": ["https://app.example.com/*"],  // only inject on your SaaS domain
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_idle"                  // wait for page to load
    }
  ],
  
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  
  "web_accessible_resources": [
    {
      "resources": ["icons/*", "assets/*"],
      "matches": ["https://app.example.com/*"]
    }
  ]
}
```

```typescript
// src/background/service-worker.ts — Background service worker for state management
import { TourState, TourDefinition } from "../types";

// Fetch tour definitions from the onboarding API
async function fetchTours(userId: string): Promise<TourDefinition[]> {
  const response = await fetch(`https://api.example.com/onboarding/tours`, {
    headers: {
      "Authorization": `Bearer ${await getAuthToken()}`,
      "X-User-Id": userId,
    },
  });
  return response.json();
}

// Track tour completion events
async function trackEvent(event: {
  userId: string;
  tourId: string;
  stepId: string;
  action: "viewed" | "completed" | "skipped" | "dismissed";
}) {
  await fetch("https://api.example.com/onboarding/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${await getAuthToken()}`,
    },
    body: JSON.stringify(event),
  });
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_TOURS") {
    fetchTours(message.userId).then(sendResponse);
    return true; // async response
  }

  if (message.type === "TRACK_EVENT") {
    trackEvent(message.event).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.type === "GET_STATE") {
    chrome.storage.local.get("tourState", (result) => {
      sendResponse(result.tourState || {});
    });
    return true;
  }

  if (message.type === "SET_STATE") {
    chrome.storage.local.set({ tourState: message.state }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

async function getAuthToken(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get("authToken", (result) => {
      resolve(result.authToken || "");
    });
  });
}
```

## Step 2: Build the Tour Definition System

Tours are defined declaratively as JSON. Each step targets a DOM element, shows contextual content, and can trigger actions. The growth team edits tour definitions without touching product code.

```typescript
// src/types.ts — Tour definition types
import { z } from "zod";

export const TourStepSchema = z.object({
  id: z.string(),
  // CSS selector for the target element — the step highlights this element
  target: z.string(),
  // Where to position the tooltip relative to the target
  placement: z.enum(["top", "bottom", "left", "right", "center"]),
  title: z.string(),
  content: z.string(),           // supports markdown
  // Optional: URL pattern — step only shows on matching pages
  urlPattern: z.string().optional(),
  // Optional: wait for this selector before showing the step
  waitFor: z.string().optional(),
  // Optional: highlight additional elements without tooltips
  highlightAlso: z.array(z.string()).optional(),
  // Actions the user can take
  actions: z.array(z.object({
    label: z.string(),
    type: z.enum(["next", "skip", "complete", "navigate", "click-target"]),
    navigateTo: z.string().optional(),
  })),
  // Completion condition — auto-advance when user performs this action
  completionTrigger: z.object({
    type: z.enum(["click", "input", "navigation", "manual"]),
    selector: z.string().optional(),
    urlPattern: z.string().optional(),
  }).optional(),
});

export const TourDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  // Who sees this tour
  audience: z.object({
    isNewUser: z.boolean().optional(),           // trial users only
    hasCompletedTour: z.string().optional(),     // prerequisite tour
    notCompletedAction: z.string().optional(),   // show if user hasn't done X
    maxDaysSinceSignup: z.number().optional(),
  }),
  steps: z.array(TourStepSchema),
  priority: z.number(),  // higher priority tours show first
});

export type TourStep = z.infer<typeof TourStepSchema>;
export type TourDefinition = z.infer<typeof TourDefinitionSchema>;

export interface TourState {
  activeTourId: string | null;
  activeStepIndex: number;
  completedTours: string[];
  dismissedTours: string[];
  completedSteps: Record<string, string[]>; // tourId → stepIds
}

// Example tour definition
export const FIRST_PROJECT_TOUR: TourDefinition = {
  id: "first-project",
  name: "Create Your First Project",
  description: "Walk through creating and configuring your first project",
  audience: {
    isNewUser: true,
    notCompletedAction: "project_created",
    maxDaysSinceSignup: 7,
  },
  priority: 100,
  steps: [
    {
      id: "welcome",
      target: "body",
      placement: "center",
      title: "Welcome to ProjectHub! 🎉",
      content: "Let's set up your first project in 2 minutes. You'll learn the basics of organizing your work.",
      actions: [
        { label: "Let's go!", type: "next" },
        { label: "I'll explore on my own", type: "skip" },
      ],
    },
    {
      id: "new-project-button",
      target: '[data-testid="new-project-btn"]',
      placement: "bottom",
      title: "Create a New Project",
      content: "Click here to start a new project. Projects are where you organize tasks, timelines, and team members.",
      actions: [
        { label: "Click it for me", type: "click-target" },
      ],
      completionTrigger: {
        type: "click",
        selector: '[data-testid="new-project-btn"]',
      },
    },
    {
      id: "project-name",
      target: '[data-testid="project-name-input"]',
      placement: "right",
      title: "Name Your Project",
      content: "Give your project a name. Try something like 'Marketing Q2' or 'Product Launch'.",
      waitFor: '[data-testid="project-name-input"]', // wait for modal to open
      actions: [
        { label: "Next", type: "next" },
      ],
      completionTrigger: {
        type: "input",
        selector: '[data-testid="project-name-input"]',
      },
    },
    {
      id: "invite-team",
      target: '[data-testid="invite-members-section"]',
      placement: "left",
      title: "Invite Your Team",
      content: "Add team members by email. They'll get access to this project immediately. You can always add more later.",
      actions: [
        { label: "I'll do this later", type: "next" },
      ],
    },
    {
      id: "complete",
      target: '[data-testid="create-project-submit"]',
      placement: "top",
      title: "Create the Project!",
      content: "Hit create and you're done. Next, we'll show you how to add your first task.",
      actions: [
        { label: "Create Project", type: "click-target" },
      ],
      completionTrigger: {
        type: "click",
        selector: '[data-testid="create-project-submit"]',
      },
    },
  ],
};
```

## Step 3: Build the Content Script Overlay

The content script renders tour overlays on top of the SaaS UI. It handles element targeting, spotlight highlighting, tooltip positioning, and smooth transitions between steps.

```typescript
// src/content/tour-renderer.ts — Render tour overlays on the page
import { TourStep, TourState, TourDefinition } from "../types";

export class TourRenderer {
  private overlay: HTMLDivElement | null = null;
  private tooltip: HTMLDivElement | null = null;
  private spotlight: HTMLDivElement | null = null;
  private currentStep: TourStep | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // Inject the tour UI into the page
  mount(): void {
    // Create overlay backdrop
    this.overlay = document.createElement("div");
    this.overlay.id = "tour-overlay";
    this.overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 99998;
      background: rgba(0,0,0,0.5);
      transition: opacity 0.3s ease;
      pointer-events: none;
    `;

    // Create spotlight cutout
    this.spotlight = document.createElement("div");
    this.spotlight.id = "tour-spotlight";
    this.spotlight.style.cssText = `
      position: fixed; z-index: 99999;
      border-radius: 8px;
      box-shadow: 0 0 0 9999px rgba(0,0,0,0.5);
      transition: all 0.3s ease;
      pointer-events: none;
    `;

    // Create tooltip container
    this.tooltip = document.createElement("div");
    this.tooltip.id = "tour-tooltip";
    this.tooltip.style.cssText = `
      position: fixed; z-index: 100000;
      max-width: 360px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      padding: 24px;
      transition: all 0.3s ease;
    `;

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.spotlight);
    document.body.appendChild(this.tooltip);
  }

  // Show a specific tour step
  async showStep(
    step: TourStep,
    stepIndex: number,
    totalSteps: number,
    onAction: (action: string) => void
  ): Promise<void> {
    this.currentStep = step;

    // Wait for target element if specified
    if (step.waitFor) {
      await this.waitForElement(step.waitFor, 10000); // 10s timeout
    }

    const target = step.target === "body"
      ? null
      : document.querySelector(step.target);

    if (target && step.target !== "body") {
      // Position spotlight around the target element
      const rect = (target as HTMLElement).getBoundingClientRect();
      const padding = 8;

      this.spotlight!.style.left = `${rect.left - padding}px`;
      this.spotlight!.style.top = `${rect.top - padding}px`;
      this.spotlight!.style.width = `${rect.width + padding * 2}px`;
      this.spotlight!.style.height = `${rect.height + padding * 2}px`;
      this.spotlight!.style.display = "block";

      // Allow clicking the target element
      (target as HTMLElement).style.position = "relative";
      (target as HTMLElement).style.zIndex = "99999";
      (target as HTMLElement).style.pointerEvents = "auto";

      // Position tooltip relative to target
      this.positionTooltip(rect, step.placement);

      // Track target position changes (scroll, resize)
      this.resizeObserver?.disconnect();
      this.resizeObserver = new ResizeObserver(() => {
        const newRect = (target as HTMLElement).getBoundingClientRect();
        this.spotlight!.style.left = `${newRect.left - padding}px`;
        this.spotlight!.style.top = `${newRect.top - padding}px`;
        this.positionTooltip(newRect, step.placement);
      });
      this.resizeObserver.observe(target as HTMLElement);
    } else {
      // Center placement (no target element)
      this.spotlight!.style.display = "none";
      this.tooltip!.style.left = "50%";
      this.tooltip!.style.top = "50%";
      this.tooltip!.style.transform = "translate(-50%, -50%)";
    }

    // Render tooltip content
    this.tooltip!.innerHTML = `
      <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 12px; color: #6b7280;">${stepIndex + 1} of ${totalSteps}</span>
        <button id="tour-close" style="background: none; border: none; cursor: pointer; font-size: 18px; color: #9ca3af;">×</button>
      </div>
      <h3 style="font-size: 18px; font-weight: 600; margin: 0 0 8px 0; color: #111827;">${step.title}</h3>
      <p style="font-size: 14px; color: #4b5563; line-height: 1.5; margin: 0 0 16px 0;">${step.content}</p>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        ${step.actions.map((action, i) => `
          <button 
            class="tour-action" 
            data-action="${action.type}"
            style="
              padding: 8px 16px; border-radius: 8px; font-size: 14px; cursor: pointer;
              ${i === step.actions.length - 1
                ? "background: #2563eb; color: white; border: none;"
                : "background: white; color: #4b5563; border: 1px solid #d1d5db;"
              }
            "
          >${action.label}</button>
        `).join("")}
      </div>
      <!-- Progress dots -->
      <div style="display: flex; justify-content: center; gap: 4px; margin-top: 12px;">
        ${Array.from({ length: totalSteps }, (_, i) => `
          <div style="
            width: 6px; height: 6px; border-radius: 50%;
            background: ${i <= stepIndex ? "#2563eb" : "#d1d5db"};
          "></div>
        `).join("")}
      </div>
    `;

    // Bind action buttons
    this.tooltip!.querySelectorAll(".tour-action").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const action = (e.target as HTMLElement).dataset.action!;
        onAction(action);
      });
    });

    this.tooltip!.querySelector("#tour-close")?.addEventListener("click", () => {
      onAction("dismiss");
    });

    // Set up completion trigger if defined
    if (step.completionTrigger) {
      this.setupCompletionTrigger(step.completionTrigger, () => onAction("next"));
    }
  }

  private positionTooltip(targetRect: DOMRect, placement: string): void {
    const gap = 16;
    const tooltip = this.tooltip!;

    switch (placement) {
      case "bottom":
        tooltip.style.left = `${targetRect.left + targetRect.width / 2}px`;
        tooltip.style.top = `${targetRect.bottom + gap}px`;
        tooltip.style.transform = "translateX(-50%)";
        break;
      case "top":
        tooltip.style.left = `${targetRect.left + targetRect.width / 2}px`;
        tooltip.style.top = `${targetRect.top - gap}px`;
        tooltip.style.transform = "translate(-50%, -100%)";
        break;
      case "right":
        tooltip.style.left = `${targetRect.right + gap}px`;
        tooltip.style.top = `${targetRect.top + targetRect.height / 2}px`;
        tooltip.style.transform = "translateY(-50%)";
        break;
      case "left":
        tooltip.style.left = `${targetRect.left - gap}px`;
        tooltip.style.top = `${targetRect.top + targetRect.height / 2}px`;
        tooltip.style.transform = "translate(-100%, -50%)";
        break;
    }
  }

  private async waitForElement(selector: string, timeout: number): Promise<Element | null> {
    const existing = document.querySelector(selector);
    if (existing) return existing;

    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) { observer.disconnect(); resolve(el); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
    });
  }

  private setupCompletionTrigger(
    trigger: { type: string; selector?: string },
    onComplete: () => void
  ): void {
    if (trigger.type === "click" && trigger.selector) {
      const el = document.querySelector(trigger.selector);
      el?.addEventListener("click", onComplete, { once: true });
    }
    if (trigger.type === "input" && trigger.selector) {
      const el = document.querySelector(trigger.selector) as HTMLInputElement;
      el?.addEventListener("input", () => {
        if (el.value.length >= 3) onComplete();
      });
    }
  }

  unmount(): void {
    this.overlay?.remove();
    this.spotlight?.remove();
    this.tooltip?.remove();
    this.resizeObserver?.disconnect();
  }
}
```

## Results

After deploying the onboarding extension:

- **Trial-to-activation rate improved from 28% to 52%** — guided tours walk users through the "aha moment" (creating first project + adding first task) in under 3 minutes
- **Growth team iteration speed: hours instead of sprints** — tour definitions are JSON configs deployed independently of the product; A/B testing new tour flows takes 1 hour instead of a 2-week sprint cycle
- **Feature discovery improved by 65%** — contextual tooltips surface features like automation rules and keyboard shortcuts that 80% of users never found on their own
- **Tour completion rate: 71%** — users who start the "First Project" tour complete it 71% of the time; the center-modal welcome step is key to setting expectations
- **Extension footprint: 45KB** — minimal impact on page load; the content script only activates when a tour should display, based on user state from the background service worker
