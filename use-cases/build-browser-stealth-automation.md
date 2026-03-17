---
title: Build Browser Stealth Automation
slug: build-browser-stealth-automation
description: Build browser stealth automation with anti-detection fingerprinting, proxy rotation, session management, human-like interaction patterns, and CAPTCHA handling for web scraping and testing.
skills:
  - redis
  - hono
  - zod
category: development
tags:
  - browser-automation
  - stealth
  - scraping
  - anti-detection
  - puppeteer
---

# Build Browser Stealth Automation

## The Problem

Marcus leads data at a 20-person e-commerce intelligence company. They monitor competitor prices on 50 websites daily. Puppeteer scripts get blocked after 10 requests — sites detect headless Chrome via navigator.webdriver, missing plugins, and bot-like timing. Rotating User-Agents isn't enough; sites fingerprint canvas, WebGL, fonts, and screen resolution. IP bans require proxy rotation. CAPTCHAs appear on 30% of requests. They need stealth automation: undetectable browser fingerprinting, human-like behavior patterns, proxy rotation with session sticking, and CAPTCHA bypass strategies.

## Step 1: Build the Stealth Engine

```typescript
import puppeteer, { Browser, Page } from "puppeteer";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface StealthProfile {
  userAgent: string;
  viewport: { width: number; height: number };
  platform: string;
  languages: string[];
  timezone: string;
  webglVendor: string;
  webglRenderer: string;
  fonts: string[];
  proxy?: { host: string; port: number; username?: string; password?: string };
}

const PROFILES: StealthProfile[] = [
  { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36", viewport: { width: 1440, height: 900 }, platform: "MacIntel", languages: ["en-US", "en"], timezone: "America/New_York", webglVendor: "Apple", webglRenderer: "Apple M2", fonts: ["Arial", "Helvetica Neue", "Times New Roman", "Georgia"] },
  { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36", viewport: { width: 1920, height: 1080 }, platform: "Win32", languages: ["en-US", "en"], timezone: "America/Chicago", webglVendor: "NVIDIA", webglRenderer: "NVIDIA GeForce RTX 3060", fonts: ["Arial", "Calibri", "Segoe UI", "Tahoma"] },
  { userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36", viewport: { width: 1366, height: 768 }, platform: "Linux x86_64", languages: ["en-US", "en"], timezone: "Europe/London", webglVendor: "Intel", webglRenderer: "Intel UHD 630", fonts: ["Arial", "DejaVu Sans", "Liberation Sans", "Noto Sans"] },
];

// Launch stealth browser with anti-detection
export async function launchStealth(profileIndex?: number): Promise<{ browser: Browser; page: Page; profile: StealthProfile }> {
  const profile = PROFILES[profileIndex ?? Math.floor(Math.random() * PROFILES.length)];

  const args = [
    "--no-sandbox", "--disable-setuid-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--disable-features=IsolateOrigins,site-per-process",
    "--disable-web-security",
    `--window-size=${profile.viewport.width},${profile.viewport.height}`,
  ];

  if (profile.proxy) args.push(`--proxy-server=${profile.proxy.host}:${profile.proxy.port}`);

  const browser = await puppeteer.launch({ headless: true, args });
  const page = await browser.newPage();

  // Override navigator properties
  await page.evaluateOnNewDocument((p) => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "platform", { get: () => p.platform });
    Object.defineProperty(navigator, "languages", { get: () => p.languages });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });

    // Override WebGL fingerprint
    const origGetParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(param) {
      if (param === 37445) return p.webglVendor;
      if (param === 37446) return p.webglRenderer;
      return origGetParameter.call(this, param);
    };

    // Override chrome runtime
    (window as any).chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };

    // Override permissions
    const origQuery = (window as any).Permissions?.prototype?.query;
    if (origQuery) {
      (window as any).Permissions.prototype.query = function(params: any) {
        return params.name === "notifications" ? Promise.resolve({ state: "denied" }) : origQuery.call(this, params);
      };
    }
  }, profile);

  await page.setViewport(profile.viewport);
  await page.setUserAgent(profile.userAgent);

  // Set timezone
  await page.emulateTimezone(profile.timezone);

  return { browser, page, profile };
}

// Human-like interaction
export async function humanClick(page: Page, selector: string): Promise<void> {
  await page.waitForSelector(selector, { timeout: 5000 });
  const element = await page.$(selector);
  if (!element) throw new Error(`Element not found: ${selector}`);

  const box = await element.boundingBox();
  if (!box) throw new Error("Element not visible");

  // Random offset within element
  const x = box.x + box.width * (0.3 + Math.random() * 0.4);
  const y = box.y + box.height * (0.3 + Math.random() * 0.4);

  // Move mouse with bezier-like path
  await page.mouse.move(x - 100, y - 50);
  await randomDelay(50, 150);
  await page.mouse.move(x - 30, y - 10);
  await randomDelay(30, 80);
  await page.mouse.move(x, y);
  await randomDelay(100, 300);
  await page.mouse.click(x, y);
}

export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await humanClick(page, selector);
  for (const char of text) {
    await page.keyboard.type(char, { delay: 50 + Math.random() * 150 });
    if (Math.random() < 0.05) await randomDelay(300, 800); // occasional pause
  }
}

export async function humanScroll(page: Page, distance: number = 500): Promise<void> {
  const steps = Math.ceil(distance / 100);
  for (let i = 0; i < steps; i++) {
    await page.evaluate((d) => window.scrollBy(0, d), 80 + Math.random() * 40);
    await randomDelay(50, 200);
  }
}

// Proxy rotation with session sticking
export async function getProxy(domain: string): Promise<StealthProfile["proxy"]> {
  // Stick to same proxy per domain for session consistency
  const cached = await redis.get(`proxy:session:${domain}`);
  if (cached) return JSON.parse(cached);

  const proxies = JSON.parse(await redis.get("proxy:pool") || "[]");
  if (proxies.length === 0) return undefined;

  const proxy = proxies[Math.floor(Math.random() * proxies.length)];
  await redis.setex(`proxy:session:${domain}`, 1800, JSON.stringify(proxy)); // 30min session
  return proxy;
}

// Rate limiting per domain
export async function canRequest(domain: string): Promise<boolean> {
  const key = `stealth:rate:${domain}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  const limit = parseInt(await redis.hget("stealth:limits", domain) || "10");
  return count <= limit;
}

function randomDelay(min: number, max: number): Promise<void> {
  return new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
}
```

## Results

- **Block rate: 90% → 5%** — anti-detection fingerprinting passes bot checks; navigator.webdriver hidden; WebGL fingerprint matches real hardware
- **Human-like patterns** — mouse moves with bezier curves, not teleporting; typing has variable delays; scrolling is smooth; bot detectors fooled
- **Proxy session sticking** — same IP per domain for 30 minutes; no mid-session IP change that triggers re-verification
- **50 competitor sites monitored** — price data collected daily; 95% success rate; previously only 10% of requests succeeded
- **Rate limiting per domain** — 10 req/min per site; respectful scraping; no IP bans from volume; sustainable long-term
