---
title: Build a Telegram Mini App
slug: build-telegram-mini-app
description: Build a Telegram Mini App (Web App) that runs inside Telegram with native UX — MainButton, BackButton, HapticFeedback, secure initData authentication, Telegram Payments, and deployment to Vercel.
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

Alex is a founder who runs a digital products business. He sells templates and courses to a Telegram audience of 50,000 subscribers. He wants to build a storefront that lives inside Telegram — users browse products, tap "Buy", pay with Telegram Payments (no app store cuts), and get their download link without ever opening a browser. Telegram Mini Apps make this possible with native platform feel.

## Step 1: Create the Bot and Configure Web App

```bash
# 1. Create bot via @BotFather
/newbot
# → Get TOKEN: 7123456789:AABBCCDDEEFFaabbccddeeff...

# 2. Set menu button (opens Mini App)
/setmenubutton
# Select your bot
# Button text: 🛒 Shop
# Button URL: https://your-mini-app.vercel.app

# 3. Enable payments (for Telegram Payments)
/mypayments
# Connect Stripe or other provider via BotFather

# 4. Set up web app domain
/setdomain
# Enter your deployed URL
```

```typescript
// bot/index.ts — Bot that launches the Mini App
import { Bot, InlineKeyboard } from "grammy";

const bot = new Bot(process.env.BOT_TOKEN!);

// Start command — show Mini App button
bot.command("start", async (ctx) => {
  const keyboard = new InlineKeyboard().webApp("🛒 Open Shop", process.env.MINI_APP_URL!);
  await ctx.reply(
    "Welcome to the shop! Browse and buy products directly in Telegram.",
    { reply_markup: keyboard }
  );
});

// Handle successful payments
bot.on("message:successful_payment", async (ctx) => {
  const payment = ctx.message.successful_payment;
  const payload = JSON.parse(payment.invoice_payload);

  // Deliver product
  await deliverProduct(ctx.from!.id, payload.productId);

  await ctx.reply(
    `✅ Payment confirmed! Your ${payment.total_amount / 100} ${payment.currency} purchase is ready.`
  );
});

// Handle pre-checkout (validate before charging)
bot.on("pre_checkout_query", async (ctx) => {
  // Validate stock, check if product still exists
  const payload = JSON.parse(ctx.preCheckoutQuery.invoice_payload);
  const product = await getProduct(payload.productId);

  if (!product || !product.available) {
    await ctx.answerPreCheckoutQuery(false, "This product is no longer available.");
    return;
  }
  await ctx.answerPreCheckoutQuery(true);
});

bot.start();
```

## Step 2: Frontend — React with Telegram WebApp SDK

```typescript
// src/App.tsx — Mini App root
import { useEffect, useState } from "react";
import { ProductList } from "./components/ProductList";
import { Cart } from "./components/Cart";
import { useCartStore } from "./store/cart";

// Telegram WebApp SDK types
declare global {
  interface Window {
    Telegram: {
      WebApp: TelegramWebApp;
    };
  }
}

export default function App() {
  const { items } = useCartStore();
  const [view, setView] = useState<"shop" | "cart">("shop");

  useEffect(() => {
    const twa = window.Telegram.WebApp;

    // Expand to full height
    twa.expand();
    twa.ready();

    // Apply Telegram color theme
    document.documentElement.style.setProperty("--tg-bg", twa.themeParams.bg_color || "#fff");
    document.documentElement.style.setProperty("--tg-text", twa.themeParams.text_color || "#000");
    document.documentElement.style.setProperty("--tg-button", twa.themeParams.button_color || "#2481cc");
  }, []);

  // Show cart button when items in cart
  useEffect(() => {
    const twa = window.Telegram.WebApp;

    if (items.length > 0 && view === "shop") {
      twa.MainButton.setParams({
        text: `🛒 View Cart (${items.length})`,
        color: twa.themeParams.button_color,
        text_color: twa.themeParams.button_text_color,
        is_visible: true,
      });
      twa.MainButton.onClick(() => setView("cart"));
    } else {
      twa.MainButton.hide();
    }
  }, [items.length, view]);

  // Handle back navigation
  useEffect(() => {
    const twa = window.Telegram.WebApp;

    if (view === "cart") {
      twa.BackButton.show();
      twa.BackButton.onClick(() => {
        setView("shop");
        twa.BackButton.hide();
      });
    }
  }, [view]);

  return (
    <div className="app" style={{ background: "var(--tg-bg)", color: "var(--tg-text)", minHeight: "100vh" }}>
      {view === "shop" ? <ProductList /> : <Cart onCheckout={handleCheckout} />}
    </div>
  );
}
```

## Step 3: Product List and Cart Components

```typescript
// src/components/ProductList.tsx
import { useEffect, useState } from "react";
import { useCartStore } from "../store/cart";

interface Product { id: string; name: string; price: number; description: string; image: string }

export function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const { addItem } = useCartStore();

  useEffect(() => {
    fetch("/api/products").then((r) => r.json()).then(setProducts);
  }, []);

  const handleAdd = (product: Product) => {
    addItem(product);
    // Haptic feedback — feels native on iOS/Android
    window.Telegram.WebApp.HapticFeedback.impactOccurred("light");
  };

  return (
    <div className="product-grid">
      {products.map((p) => (
        <div key={p.id} className="product-card">
          <img src={p.image} alt={p.name} loading="lazy" />
          <h3>{p.name}</h3>
          <p>{p.description}</p>
          <div className="product-footer">
            <strong>${(p.price / 100).toFixed(2)}</strong>
            <button
              className="add-btn"
              onClick={() => handleAdd(p)}
              style={{ background: "var(--tg-button)", color: "#fff" }}
            >
              Add to Cart
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// src/components/Cart.tsx
import { useCartStore } from "../store/cart";

export function Cart({ onCheckout }: { onCheckout: () => void }) {
  const { items, removeItem, total } = useCartStore();
  const twa = window.Telegram.WebApp;

  useEffect(() => {
    twa.MainButton.setParams({ text: `Pay $${(total / 100).toFixed(2)}`, is_visible: true });
    twa.MainButton.onClick(onCheckout);
    return () => twa.MainButton.hide();
  }, [total]);

  return (
    <div className="cart">
      <h2>Your Cart</h2>
      {items.map((item) => (
        <div key={item.id} className="cart-item">
          <span>{item.name}</span>
          <span>${(item.price / 100).toFixed(2)}</span>
          <button onClick={() => removeItem(item.id)}>×</button>
        </div>
      ))}
      <div className="cart-total">Total: ${(total / 100).toFixed(2)}</div>
    </div>
  );
}
```

## Step 4: Backend — Auth, Checkout, and Payments

```typescript
// api/index.ts — Hono backend
import { Hono } from "hono";
import { createHmac } from "node:crypto";
import { products, orders } from "./db";

const app = new Hono();

// Validate Telegram initData — critical for security
function validateInitData(initData: string): Record<string, string> | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash")!;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(process.env.BOT_TOKEN!).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (expectedHash !== hash) return null;

  // Check expiry (within 1 hour)
  const authDate = parseInt(params.get("auth_date") || "0");
  if (Date.now() / 1000 - authDate > 3600) return null;

  return Object.fromEntries(params);
}

// Middleware: authenticate every request with initData
app.use("/api/*", async (c, next) => {
  const initData = c.req.header("X-Telegram-Init-Data");
  if (!initData) return c.json({ error: "Unauthorized" }, 401);

  const data = validateInitData(initData);
  if (!data) return c.json({ error: "Invalid initData" }, 401);

  const user = JSON.parse(data.user || "{}");
  c.set("telegramUser", user);
  await next();
});

app.get("/api/products", async (c) => {
  return c.json(await products.list());
});

// Create Telegram invoice for payment
app.post("/api/checkout", async (c) => {
  const user = c.get("telegramUser");
  const { items } = await c.req.json();

  const total = items.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0);

  // Create invoice via Telegram Bot API
  const invoiceRes = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/createInvoiceLink`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Digital Products Order",
      description: `${items.length} item(s)`,
      payload: JSON.stringify({ userId: user.id, items }),
      provider_token: process.env.PAYMENT_PROVIDER_TOKEN,
      currency: "USD",
      prices: items.map((item: any) => ({
        label: item.name,
        amount: item.price * item.quantity,
      })),
    }),
  });

  const { result: invoiceLink } = await invoiceRes.json();
  return c.json({ invoiceLink });
});

app.get("/api/orders", async (c) => {
  const user = c.get("telegramUser");
  const userOrders = await orders.getByUserId(user.id);
  return c.json(userOrders);
});

export default app;
```

## Step 5: Deploy to Vercel

```json
// vercel.json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index" }
  ]
}
```

```bash
# Install Vercel CLI
npm install -g vercel

# Set environment variables
vercel env add BOT_TOKEN
vercel env add PAYMENT_PROVIDER_TOKEN

# Deploy
vercel --prod
# → https://your-mini-app.vercel.app

# Update bot with new URL
# BotFather → /setdomain → your-mini-app.vercel.app

# For Cloudflare Pages (alternative):
# npm install -g wrangler
# wrangler pages deploy dist --project-name=telegram-mini-app
```

## Results

- **Conversion rate 3× higher than landing page** — users buy without leaving Telegram; no context switch, no login form
- **Native UX with zero native code** — HapticFeedback on add-to-cart, MainButton for checkout flow, BackButton for navigation — feels like a native app
- **Zero auth friction** — initData validation replaces OAuth; users are automatically authenticated via their Telegram identity
- **Payments without app store fees** — Telegram Payments uses Stripe under the hood; no 30% Apple/Google cut on digital goods
- **Deployed in 10 minutes** — Vercel deployment is a single command; Cloudflare Pages as fallback; global CDN, no server management
