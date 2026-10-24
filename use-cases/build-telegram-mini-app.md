---
title: Build a Telegram Mini App
slug: build-telegram-mini-app
description: Build a Telegram Mini App (Web App) that runs inside Telegram with native UX — MainButton, BackButton, HapticFeedback, secure initData authentication, Telegram Stars payments for digital goods, and a Hono backend.
skills:
  - typescript
  - react
  - hono
  - telegram-bot-builder
category: development
tags:
  - telegram
  - mini-app
  - web-app
  - payments
  - mobile
---

# Build a Telegram Mini App

## The Problem

Alex runs a digital products business with a Telegram audience of 50,000 subscribers. He wants a storefront inside Telegram: people browse templates and courses, pay, and get their files without opening a browser or creating an account.

## The Solution

A React front end loads in Telegram's WebView and talks to a Hono API. The API trusts nobody until it has verified the signed `initData` that Telegram hands the Mini App. Checkout creates a Telegram Stars invoice (`XTR`), which is what Telegram requires for digital goods, and a grammY bot confirms the payment and delivers the product.

## Step-by-Step Walkthrough

### 1. Create the bot and plan the project

Message @BotFather and send `/newbot`. Once the Mini App has a public HTTPS URL (Telegram only loads Mini Apps over HTTPS), set the menu button with `/setmenubutton` or Bot Settings > Menu Button.

Digital goods and services must be paid in Telegram Stars, currency `XTR`. You do not connect a payment provider or pass a `provider_token` for Stars. Users buy Stars through Apple or Google in-app purchases or @PremiumBot, so the app stores' rules apply on the buying side; check Telegram's Stars page for current fees and withdrawal terms before you plan revenue.

```bash
npm init -y && npm pkg set type=module
npm install hono @hono/node-server grammy react react-dom tsx
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/node @twa-dev/types
```

Put `BOT_TOKEN` (from BotFather) and `MINI_APP_URL` (your public HTTPS URL) in an uncommitted `.env` file.

### 2. Catalog and orders (server-side prices)

The client never sends prices. The server looks products up by id, so a user cannot change what they pay.

```typescript
// server/catalog.ts
export interface Product { id: string; name: string; description: string; stars: number }

// Prices are in Telegram Stars (XTR).
export const catalog: Product[] = [
  { id: "notion-crm", name: "Notion CRM template", description: "Pipeline, contacts and follow-ups", stars: 250 },
  { id: "ts-course", name: "TypeScript in a weekend", description: "12 video lessons + exercises", stars: 900 },
];
export const findProduct = (id: string) => catalog.find((p) => p.id === id);

export interface Order { id: string; userId: number; productIds: string[]; stars: number; paid: boolean }
export const orders = new Map<string, Order>(); // swap for a real database
```

### 3. Verify `initData`

Telegram signs the data the Mini App receives. The API recomputes an HMAC-SHA-256 over every field except `hash` (sorted, joined with newlines), keyed by an HMAC of your bot token with the constant `WebAppData`, and compares it in constant time. It also rejects stale data.

```typescript
// server/auth.ts
import { createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramUser { id: number; first_name: string; username?: string }

/** Validates Telegram.WebApp.initData as described in the Mini Apps docs. */
export function validateInitData(initData: string, botToken: string, maxAgeSec = 3600): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash"); // `signature` stays in: only `hash` is excluded for the bot-token method

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null; // stale: replay

  try { return JSON.parse(params.get("user") ?? "") as TelegramUser; } catch { return null; }
}
```

### 4. The API: authentication and checkout

The payload of an invoice is limited to 128 bytes and is not shown to the user, so it carries an order id rather than the cart. For Stars the `prices` array must contain exactly one item.

```typescript
// server/api.ts
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { validateInitData, type TelegramUser } from "./auth";
import { catalog, findProduct, orders } from "./catalog";

const BOT_TOKEN = process.env.BOT_TOKEN!;

export const api = new Hono<{ Variables: { user: TelegramUser } }>();
// Every request must carry the Mini App's initData.
api.use("*", async (c, next) => {
  const user = validateInitData(c.req.header("X-Telegram-Init-Data") ?? "", BOT_TOKEN);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", user);
  await next();
});

api.get("/products", (c) => c.json(catalog));
api.post("/checkout", async (c) => {
  const { productIds } = await c.req.json<{ productIds: string[] }>();
  const products = (productIds ?? []).map(findProduct);
  if (!products.length || products.some((p) => !p)) return c.json({ error: "Unknown product" }, 400);
  const stars = products.reduce((sum, p) => sum + p!.stars, 0);
  const order = { id: randomUUID(), userId: c.get("user").id, productIds, stars, paid: false };
  orders.set(order.id, order);

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Digital products order",
      description: products.map((p) => p!.name).join(", ").slice(0, 255),
      payload: order.id, // 1-128 bytes: an order id, never the cart itself
      currency: "XTR", // digital goods must be sold in Telegram Stars
      prices: [{ label: "Order", amount: stars }], // exactly one item for Stars
    }),
  });
  const { ok, result } = (await res.json()) as { ok: boolean; result?: string };
  return ok && result ? c.json({ invoiceLink: result }) : c.json({ error: "Could not create invoice" }, 502);
});
```

### 5. The bot: launch button, pre-checkout, delivery

Telegram sends a `pre_checkout_query` before charging and expects an answer within 10 seconds. After payment it sends a `successful_payment` message; store `telegram_payment_charge_id`, because you need it to refund.

```typescript
// server/bot.ts
import { Bot, InlineKeyboard } from "grammy";
import { orders } from "./catalog";
export const bot = new Bot(process.env.BOT_TOKEN!);
bot.command("start", (ctx) =>
  ctx.reply("Browse and buy digital products without leaving Telegram.", {
    reply_markup: new InlineKeyboard().webApp("Open shop", process.env.MINI_APP_URL!),
  }),
);

// Telegram waits for an answer to this query for 10 seconds.
bot.on("pre_checkout_query", async (ctx) => {
  const q = ctx.preCheckoutQuery;
  const order = orders.get(q.invoice_payload);
  const ok = order && !order.paid && order.userId === ctx.from.id && order.stars === q.total_amount;
  await ctx.answerPreCheckoutQuery(Boolean(ok), ok ? undefined : "This order is no longer valid.");
});
bot.on("message:successful_payment", async (ctx) => {
  const payment = ctx.message.successful_payment;
  const order = orders.get(payment.invoice_payload);
  if (!order || order.paid) return;
  order.paid = true;
  // Keep the charge id: it is required to refund the payment later.
  console.log("paid", order.id, payment.telegram_payment_charge_id);
  await ctx.reply("Payment received. Your download links are on their way.");
});
```

### 6. Serve everything from one process

The server binds to loopback and serves the Vite build; put a TLS-terminating reverse proxy or your host's HTTPS in front of it.

```typescript
// server/index.ts
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { api } from "./api";
import { bot } from "./bot";
const app = new Hono();
app.route("/api", api);
app.use("*", serveStatic({ root: "./dist" })); // the Vite build
serve({ fetch: app.fetch, port: 3000, hostname: "127.0.0.1" });
bot.start({ allowed_updates: ["message", "pre_checkout_query"] });
```

### 7. The front end

Load `<script src="https://telegram.org/js/telegram-web-app.js?64"></script>` in the `<head>` of `index.html`, before your own scripts; it defines `window.Telegram.WebApp`.

```typescript
// src/api.ts
import type { WebApp } from "@twa-dev/types";

declare global {
  interface Window { Telegram: { WebApp: WebApp } }
}
export const tg = window.Telegram.WebApp;

export interface Product { id: string; name: string; description: string; stars: number }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": tg.initData },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}
export const getProducts = () => call<Product[]>("/products");
export const createInvoice = (productIds: string[]) =>
  call<{ invoiceLink: string }>("/checkout", { method: "POST", body: JSON.stringify({ productIds }) });
```

Add the stock Vite React files (`index.html` with the script tag, `src/main.tsx` rendering `<App />`, and a `vite.config.ts` using `@vitejs/plugin-react`). `App.tsx` drives the native chrome: the MainButton shows "View cart" in the shop and "Pay" in the cart, the BackButton returns to the shop, and every handler registered in an effect is removed in its cleanup (otherwise handlers pile up and a tap fires several checkouts). `openInvoice` reports `paid`, `cancelled`, `failed` or `pending` to the callback.

```tsx
// src/App.tsx
import { useEffect, useState } from "react";
import { createInvoice, getProducts, tg, type Product } from "./api";

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<Product[]>([]);
  const [view, setView] = useState<"shop" | "cart">("shop");

  useEffect(() => { tg.ready(); tg.expand(); getProducts().then(setProducts); }, []);

  // The MainButton changes meaning with the view; its handler is removed on cleanup.
  useEffect(() => {
    const pay = async () => {
      tg.MainButton.showProgress();
      try {
        const { invoiceLink } = await createInvoice(items.map((i) => i.id));
        tg.openInvoice(invoiceLink, (status) => { if (status === "paid") { setItems([]); setView("shop"); } });
      } finally { tg.MainButton.hideProgress(); }
    };
    const handler = view === "shop" ? () => setView("cart") : pay;
    const total = items.reduce((sum, i) => sum + i.stars, 0);
    if (view === "shop" && items.length === 0) tg.MainButton.hide();
    else tg.MainButton.setParams({
      text: view === "shop" ? `View cart (${items.length})` : `Pay ${total} ⭐`, is_visible: true,
    });
    tg.MainButton.onClick(handler);
    return () => { tg.MainButton.offClick(handler); };
  }, [view, items]);

  useEffect(() => {
    const back = () => setView("shop");
    if (view === "cart") { tg.BackButton.show(); tg.BackButton.onClick(back); } else tg.BackButton.hide();
    return () => { tg.BackButton.offClick(back); };
  }, [view]);

  const add = (p: Product) => {
    setItems((cur) => (cur.some((i) => i.id === p.id) ? cur : [...cur, p]));
    tg.HapticFeedback.impactOccurred("light");
  };

  return (
    <main style={{ background: "var(--tg-theme-bg-color)", color: "var(--tg-theme-text-color)", minHeight: "100vh", padding: 16 }}>
      {view === "shop"
        ? products.map((p) => (
            <section key={p.id}>
              <h3>{p.name}</h3><p>{p.description}</p>
              <button onClick={() => add(p)}>Add · {p.stars} ⭐</button>
            </section>
          ))
        : items.map((i) => (
            <div key={i.id}>{i.name} · {i.stars} ⭐ <button onClick={() => setItems(items.filter((x) => x !== i))}>×</button></div>
          ))}
    </main>
  );
}
```

### 8. Build, run and test in Telegram

Run `npx vite build`, then `npx tsx --env-file=.env server/index.ts`. Expose the loopback port through your HTTPS host or a tunnel, use that URL as `MINI_APP_URL` and as the menu button URL, then send `/start` to the bot. Theme colours arrive as CSS variables such as `--tg-theme-bg-color`. The API needs real `initData`, so test inside Telegram, not in a plain browser tab.

## Real-World Example

Alex launches with two products. A subscriber opens the shop from the menu button, adds the Notion CRM template (a light haptic tick), taps the MainButton and confirms the Stars invoice. The bot's `successful_payment` handler marks the order paid and sends the files; the order id in the payload ties the payment to the cart the server priced. Every `/api` call is verified against `initData`, so there is no sign-up form and no password. Before going live, replace the in-memory `orders` map with a database and add a refund path using the stored charge id. Deliver from `successful_payment`, never on the Mini App's say-so.

## Related Skills

- [typescript](../skills/typescript/SKILL.md) — typing the API and the Telegram globals
- [react](../skills/react/SKILL.md) — the Mini App UI and effects
- [hono](../skills/hono/SKILL.md) — the typed API, middleware and static serving
- [telegram-bot-builder](../skills/telegram-bot-builder/SKILL.md) — the bot, payments and update handling
