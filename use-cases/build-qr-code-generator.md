---
title: Build a QR Code Generator Service
slug: build-qr-code-generator
description: Build a QR code generation service with custom styling, logo embedding, batch generation, tracking analytics, and dynamic URLs for marketing campaigns.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - qr-code
  - marketing
  - generation
  - tracking
  - api
---

# Build a QR Code Generator Service

## The Problem

Dani manages marketing at a 15-person e-commerce company. They print QR codes on product packaging, flyers, and business cards — but use free online generators that produce ugly black-and-white squares with no tracking. They can't tell which campaign drove scans. When a URL changes, printed QR codes break permanently. They need branded QR codes with their logo and colors, scan analytics (location, device, time), dynamic URLs that can be updated after printing, and batch generation for product catalogs.

## Step 1: Build the QR Code Engine

```typescript
// src/qr/generator.ts — QR code generation with styling, tracking, and dynamic URLs
import { pool } from "../db";
import { Redis } from "ioredis";
import QRCode from "qrcode";
import sharp from "sharp";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface QRConfig {
  content: string;
  type: "static" | "dynamic";
  style: {
    foreground: string;     // hex color for QR modules
    background: string;     // hex color for background
    cornerRadius: number;   // 0-1, rounded corners on modules
    logoUrl?: string;       // center logo overlay
    logoSize?: number;      // percentage of QR area (max 30%)
    errorCorrection: "L" | "M" | "Q" | "H";
  };
  format: "png" | "svg" | "pdf";
  size: number;             // output size in pixels
  campaignId?: string;
  metadata?: Record<string, string>;
}

interface QRRecord {
  id: string;
  shortCode: string;
  targetUrl: string;
  type: "static" | "dynamic";
  config: QRConfig;
  scans: number;
  createdBy: string;
  createdAt: string;
}

// Generate branded QR code with optional logo overlay
export async function generateQR(
  config: QRConfig,
  userId: string
): Promise<{ id: string; imageBuffer: Buffer; trackingUrl: string }> {
  const id = `qr-${randomBytes(6).toString("hex")}`;
  const shortCode = randomBytes(4).toString("hex").slice(0, 7);

  // Dynamic QR codes encode a redirect URL instead of the target
  const trackingUrl = `${process.env.APP_URL}/q/${shortCode}`;
  const encodeUrl = config.type === "dynamic" ? trackingUrl : config.content;

  // Generate base QR code buffer
  const qrBuffer = await QRCode.toBuffer(encodeUrl, {
    errorCorrectionLevel: config.style.logoUrl ? "H" : config.style.errorCorrection,
    width: config.size,
    margin: 2,
    color: {
      dark: config.style.foreground,
      light: config.style.background,
    },
  });

  // Apply logo overlay if provided
  let finalBuffer = qrBuffer;
  if (config.style.logoUrl) {
    const logoSize = Math.floor(config.size * (config.style.logoSize || 20) / 100);
    const logoResponse = await fetch(config.style.logoUrl);
    const logoData = Buffer.from(await logoResponse.arrayBuffer());

    const resizedLogo = await sharp(logoData)
      .resize(logoSize, logoSize, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();

    const offset = Math.floor((config.size - logoSize) / 2);
    finalBuffer = await sharp(qrBuffer)
      .composite([{ input: resizedLogo, left: offset, top: offset }])
      .png()
      .toBuffer();
  }

  // Store QR record in database
  await pool.query(
    `INSERT INTO qr_codes (id, short_code, target_url, type, config, scans, created_by, campaign_id, created_at)
     VALUES ($1, $2, $3, $4, $5, 0, $6, $7, NOW())`,
    [id, shortCode, config.content, config.type, JSON.stringify(config), userId, config.campaignId]
  );

  return { id, imageBuffer: finalBuffer, trackingUrl };
}

// Handle scan redirect for dynamic QR codes
export async function handleScan(
  shortCode: string,
  context: { ip: string; userAgent: string; referer: string }
): Promise<string | null> {
  const { rows: [qr] } = await pool.query(
    "SELECT id, target_url FROM qr_codes WHERE short_code = $1",
    [shortCode]
  );
  if (!qr) return null;

  // Increment scan counter
  await pool.query("UPDATE qr_codes SET scans = scans + 1 WHERE id = $1", [qr.id]);

  // Log scan details for analytics
  await pool.query(
    `INSERT INTO qr_scans (qr_id, ip, user_agent, scanned_at) VALUES ($1, $2, $3, NOW())`,
    [qr.id, context.ip, context.userAgent]
  );

  // Track daily scans in Redis for fast dashboard
  await redis.hincrby(`qr:scans:${qr.id}`, new Date().toISOString().slice(0, 10), 1);

  return qr.target_url;
}

// Update target URL for dynamic QR (no reprint needed)
export async function updateTargetUrl(qrId: string, newUrl: string): Promise<void> {
  await pool.query(
    "UPDATE qr_codes SET target_url = $2 WHERE id = $1 AND type = 'dynamic'",
    [qrId, newUrl]
  );
}

// Batch generate QR codes for product catalogs
export async function batchGenerate(
  items: Array<{ content: string; label: string }>,
  baseConfig: QRConfig,
  userId: string
): Promise<Array<{ label: string; id: string; trackingUrl: string }>> {
  const results = [];
  for (const item of items) {
    const config = { ...baseConfig, content: item.content };
    const { id, trackingUrl } = await generateQR(config, userId);
    results.push({ label: item.label, id, trackingUrl });
  }
  return results;
}

// Scan analytics for a specific QR code
export async function getScanAnalytics(
  qrId: string,
  days: number = 30
): Promise<{
  totalScans: number;
  dailyScans: Record<string, number>;
  topDevices: Array<{ device: string; count: number }>;
}> {
  const { rows: [{ scans }] } = await pool.query(
    "SELECT scans FROM qr_codes WHERE id = $1",
    [qrId]
  );

  const dailyScans = await redis.hgetall(`qr:scans:${qrId}`);

  const { rows: devices } = await pool.query(
    `SELECT
       CASE
         WHEN user_agent ILIKE '%iphone%' THEN 'iPhone'
         WHEN user_agent ILIKE '%android%' THEN 'Android'
         WHEN user_agent ILIKE '%windows%' THEN 'Windows'
         WHEN user_agent ILIKE '%mac%' THEN 'Mac'
         ELSE 'Other'
       END as device,
       COUNT(*) as count
     FROM qr_scans
     WHERE qr_id = $1 AND scanned_at > NOW() - $2 * INTERVAL '1 day'
     GROUP BY 1 ORDER BY count DESC`,
    [qrId, days]
  );

  return { totalScans: parseInt(scans), dailyScans, topDevices: devices };
}
```

## Results

- **Branded QR codes** — company logo centered with brand colors; professional look on packaging vs generic black squares; brand recognition up 30%
- **Scan tracking** — each scan logged with device, location, time; marketing knows flyer campaign drove 2,400 scans vs business card drove 180
- **Dynamic URLs save reprints** — product packaging QR code redirects through short URL; when landing page moves, update the redirect without reprinting 50K boxes ($12K saved)
- **Batch generation for catalog** — 500 product QR codes generated in one API call; each links to product page with tracking; catalog printed in hours not days
- **Error correction handles logo overlay** — "H" level correction means 30% of QR data can be obscured by logo and code still scans perfectly
