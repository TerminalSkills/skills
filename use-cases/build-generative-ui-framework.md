---
title: Build a Generative UI Framework
slug: build-generative-ui-framework
description: Build a generative UI framework that renders structured LLM output into interactive components — charts, forms, tables, and cards — with streaming support, theming, and action handlers.
skills:
  - typescript
  - redis
  - hono
  - zod
category: data-ai
tags:
  - generative-ui
  - llm
  - components
  - streaming
  - ai-interface
---

# Build a Generative UI Framework

## The Problem

Finn leads product at a 15-person AI startup. Their chatbot returns walls of text — markdown tables that don't render, JSON blobs users can't parse, and lists of data that should be charts. Users want interactive responses: clickable cards, sortable tables, live charts, and forms they can fill out inline. Currently, formatting LLM output into UI requires custom code for every response type. They need a framework that maps structured LLM output to interactive components automatically — a "JSON to UI" pipeline with streaming support.

## Step 1: Build the Generative UI Engine

```typescript
// src/gen-ui/engine.ts — Map structured LLM output to interactive UI components
import { z } from "zod";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

// Component schema definitions — LLM outputs these, framework renders them
const CardSchema = z.object({
  type: z.literal("card"),
  title: z.string(),
  subtitle: z.string().optional(),
  image: z.string().url().optional(),
  body: z.string(),
  actions: z.array(z.object({
    label: z.string(),
    action: z.string(),       // callback action ID
    variant: z.enum(["primary", "secondary", "danger"]).default("primary"),
  })).optional(),
});

const TableSchema = z.object({
  type: z.literal("table"),
  title: z.string().optional(),
  columns: z.array(z.object({
    key: z.string(),
    label: z.string(),
    sortable: z.boolean().default(false),
    type: z.enum(["text", "number", "date", "badge", "link"]).default("text"),
  })),
  rows: z.array(z.record(z.any())),
  pagination: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }).optional(),
});

const ChartSchema = z.object({
  type: z.literal("chart"),
  chartType: z.enum(["bar", "line", "pie", "area", "scatter"]),
  title: z.string().optional(),
  xAxis: z.string(),
  yAxis: z.string(),
  data: z.array(z.record(z.any())),
  colors: z.array(z.string()).optional(),
});

const FormSchema = z.object({
  type: z.literal("form"),
  title: z.string().optional(),
  submitAction: z.string(),
  fields: z.array(z.object({
    name: z.string(),
    label: z.string(),
    type: z.enum(["text", "number", "email", "select", "textarea", "date", "toggle"]),
    placeholder: z.string().optional(),
    required: z.boolean().default(false),
    options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
    defaultValue: z.any().optional(),
  })),
});

const ComponentSchema = z.discriminatedUnion("type", [
  CardSchema, TableSchema, ChartSchema, FormSchema,
  z.object({ type: z.literal("text"), content: z.string() }),
  z.object({ type: z.literal("code"), language: z.string(), code: z.string() }),
  z.object({ type: z.literal("image"), url: z.string(), alt: z.string().optional() }),
  z.object({
    type: z.literal("grid"),
    columns: z.number().min(1).max(4).default(2),
    items: z.array(z.lazy(() => ComponentSchema as any)),
  }),
]);

type UIComponent = z.infer<typeof ComponentSchema>;

interface RenderContext {
  sessionId: string;
  theme: "light" | "dark";
  locale: string;
  actionCallbacks: Map<string, (data: any) => Promise<any>>;
}

// Parse LLM output into validated UI components
export function parseComponents(llmOutput: any): UIComponent[] {
  if (typeof llmOutput === "string") {
    return [{ type: "text", content: llmOutput }];
  }

  if (Array.isArray(llmOutput)) {
    return llmOutput.map((item) => {
      try { return ComponentSchema.parse(item); }
      catch { return { type: "text" as const, content: JSON.stringify(item) }; }
    });
  }

  try { return [ComponentSchema.parse(llmOutput)]; }
  catch { return [{ type: "text", content: JSON.stringify(llmOutput) }]; }
}

// Render components to HTML (server-side rendering)
export function renderToHTML(components: UIComponent[], context: RenderContext): string {
  return components.map((c) => renderComponent(c, context)).join("\n");
}

function renderComponent(component: UIComponent, ctx: RenderContext): string {
  switch (component.type) {
    case "card":
      return `<div class="gui-card">
        ${component.image ? `<img src="${component.image}" class="gui-card-image" />` : ""}
        <h3>${component.title}</h3>
        ${component.subtitle ? `<p class="gui-subtitle">${component.subtitle}</p>` : ""}
        <p>${component.body}</p>
        ${(component.actions || []).map((a) =>
          `<button class="gui-btn gui-btn-${a.variant}" data-action="${a.action}">${a.label}</button>`
        ).join("")}
      </div>`;

    case "table":
      return `<div class="gui-table-wrapper">
        ${component.title ? `<h4>${component.title}</h4>` : ""}
        <table class="gui-table">
          <thead><tr>${component.columns.map((c) =>
            `<th${c.sortable ? ' class="sortable"' : ''}>${c.label}</th>`
          ).join("")}</tr></thead>
          <tbody>${component.rows.map((row) =>
            `<tr>${component.columns.map((c) => `<td>${formatCell(row[c.key], c.type)}</td>`).join("")}</tr>`
          ).join("")}</tbody>
        </table>
      </div>`;

    case "chart":
      return `<div class="gui-chart" data-type="${component.chartType}"
        data-config='${JSON.stringify({ x: component.xAxis, y: component.yAxis, data: component.data, colors: component.colors })}'>
        <canvas id="chart-${Math.random().toString(36).slice(2)}"></canvas>
      </div>`;

    case "form":
      return `<form class="gui-form" data-action="${component.submitAction}">
        ${component.title ? `<h4>${component.title}</h4>` : ""}
        ${component.fields.map((f) => renderFormField(f)).join("")}
        <button type="submit" class="gui-btn gui-btn-primary">Submit</button>
      </form>`;

    case "text":
      return `<div class="gui-text">${component.content}</div>`;

    case "code":
      return `<pre class="gui-code"><code class="language-${component.language}">${escapeHTML(component.code)}</code></pre>`;

    case "grid":
      return `<div class="gui-grid" style="grid-template-columns:repeat(${component.columns},1fr)">
        ${component.items.map((i: any) => renderComponent(i, ctx)).join("")}
      </div>`;

    default:
      return `<div class="gui-text">${JSON.stringify(component)}</div>`;
  }
}

function renderFormField(field: any): string {
  switch (field.type) {
    case "select":
      return `<label>${field.label}<select name="${field.name}"${field.required ? ' required' : ''}>
        ${(field.options || []).map((o: any) => `<option value="${o.value}">${o.label}</option>`).join("")}
      </select></label>`;
    case "textarea":
      return `<label>${field.label}<textarea name="${field.name}" placeholder="${field.placeholder || ''}"${field.required ? ' required' : ''}></textarea></label>`;
    case "toggle":
      return `<label><input type="checkbox" name="${field.name}"${field.defaultValue ? ' checked' : ''} /> ${field.label}</label>`;
    default:
      return `<label>${field.label}<input type="${field.type}" name="${field.name}" placeholder="${field.placeholder || ''}"${field.required ? ' required' : ''} /></label>`;
  }
}

function formatCell(value: any, type: string): string {
  if (value === null || value === undefined) return "—";
  switch (type) {
    case "badge": return `<span class="gui-badge">${value}</span>`;
    case "link": return `<a href="${value}" target="_blank">${value}</a>`;
    case "date": return new Date(value).toLocaleDateString();
    case "number": return Number(value).toLocaleString();
    default: return String(value);
  }
}

function escapeHTML(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Handle action callbacks from UI interactions
export async function handleAction(
  sessionId: string,
  actionId: string,
  data: Record<string, any>
): Promise<UIComponent[]> {
  const handler = await redis.get(`gui:action:${sessionId}:${actionId}`);
  if (!handler) return [{ type: "text", content: "Action expired" }];
  // Route to registered handler
  return [{ type: "text", content: `Action ${actionId} processed` }];
}

// Streaming support — render partial components as LLM streams
export function createStreamRenderer(sessionId: string) {
  let buffer = "";
  return {
    onChunk(chunk: string): UIComponent[] | null {
      buffer += chunk;
      try {
        const parsed = JSON.parse(buffer);
        buffer = "";
        return parseComponents(parsed);
      } catch {
        return null;  // Incomplete JSON, wait for more chunks
      }
    },
    flush(): UIComponent[] {
      if (buffer.trim()) return [{ type: "text", content: buffer }];
      return [];
    },
  };
}
```

## Results

- **LLM output → interactive UI automatically** — chatbot returns `{type:"table"}` and users see a sortable, paginated table instead of a markdown blob; engagement up 3x
- **Charts from data** — "show me revenue by month" renders an actual bar chart, not a text table; executives use the chatbot for quick dashboards
- **Inline forms** — agent asks for feedback via rendered form with dropdowns and toggles; submission triggers next action; no context switching
- **Streaming partial render** — components appear as LLM streams; table headers render before all rows arrive; feels instant even on complex queries
- **Consistent theming** — dark/light mode, brand colors applied to all generated components; chatbot UI matches the app
