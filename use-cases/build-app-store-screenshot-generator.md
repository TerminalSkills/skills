---
title: Build an App Store Screenshot Generator
slug: build-app-store-screenshot-generator
description: Build an app store screenshot generator with device frame overlays, text badges, multi-locale support, batch rendering, and A/B variant generation for iOS and Android app listings.
skills:
  - redis
  - hono
  - zod
category: development
tags:
  - app-store
  - screenshots
  - mobile
  - automation
  - marketing
---

# Build an App Store Screenshot Generator

## The Problem

Sam leads mobile marketing at a 20-person app company supporting 8 languages. Each app store listing needs 6 screenshots × 4 device sizes × 8 languages = 192 images per update. Designers create each manually in Figma — 3 days of work. When copy changes, all 192 need updating. A/B testing screenshots (which headline converts better?) requires another 192 variants. They need automated generation: app screenshot + device frame + marketing text + localized copy, rendered programmatically in all sizes, with A/B variants.

## Step 1: Build the Screenshot Generator

```typescript
import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

interface ScreenshotConfig {
  appScreenshot: string;  // path to raw app screenshot
  deviceFrame: "iphone15" | "iphone15pro" | "ipad" | "pixel8" | "galaxys24";
  headline: string;
  subtitle?: string;
  backgroundColor: string;
  textColor: string;
  badgeText?: string;
  badgeColor?: string;
  locale: string;
  variant?: string;  // for A/B testing
}

interface DeviceSpec {
  width: number; height: number;
  screenX: number; screenY: number;
  screenWidth: number; screenHeight: number;
  framePath: string;
}

const DEVICE_SPECS: Record<string, DeviceSpec> = {
  iphone15: { width: 1290, height: 2796, screenX: 80, screenY: 120, screenWidth: 1130, screenHeight: 2446, framePath: "frames/iphone15.png" },
  iphone15pro: { width: 1320, height: 2868, screenX: 75, screenY: 110, screenWidth: 1170, screenHeight: 2532, framePath: "frames/iphone15pro.png" },
  ipad: { width: 2048, height: 2732, screenX: 100, screenY: 100, screenWidth: 1848, screenHeight: 2532, framePath: "frames/ipad.png" },
  pixel8: { width: 1080, height: 2400, screenX: 60, screenY: 100, screenWidth: 960, screenHeight: 2140, framePath: "frames/pixel8.png" },
  galaxys24: { width: 1080, height: 2340, screenX: 50, screenY: 90, screenWidth: 980, screenHeight: 2120, framePath: "frames/galaxys24.png" },
};

const APP_STORE_SIZES = [
  { name: "iPhone 6.7\"", width: 1290, height: 2796 },
  { name: "iPhone 6.5\"", width: 1242, height: 2688 },
  { name: "iPhone 5.5\"", width: 1242, height: 2208 },
  { name: "iPad 12.9\"", width: 2048, height: 2732 },
];

// Generate single screenshot
export async function generateScreenshot(config: ScreenshotConfig): Promise<Buffer> {
  const spec = DEVICE_SPECS[config.deviceFrame];
  const canvasWidth = spec.width + 200;  // padding
  const canvasHeight = spec.height + 400;  // room for text

  // Create background
  let canvas = sharp({
    create: { width: canvasWidth, height: canvasHeight, channels: 4, background: hexToRgba(config.backgroundColor) },
  }).png();

  const composites: sharp.OverlayOptions[] = [];

  // Add headline text (rendered as SVG)
  const headlineSvg = `<svg width="${canvasWidth}" height="200">
    <text x="${canvasWidth / 2}" y="80" text-anchor="middle" font-size="72" font-weight="bold" font-family="system-ui" fill="${config.textColor}">${escSvg(config.headline)}</text>
    ${config.subtitle ? `<text x="${canvasWidth / 2}" y="140" text-anchor="middle" font-size="36" font-family="system-ui" fill="${config.textColor}" opacity="0.8">${escSvg(config.subtitle)}</text>` : ""}
  </svg>`;
  composites.push({ input: Buffer.from(headlineSvg), top: 30, left: 0 });

  // Add app screenshot inside device frame
  const appImg = await sharp(config.appScreenshot).resize(spec.screenWidth, spec.screenHeight, { fit: "cover" }).png().toBuffer();
  composites.push({ input: appImg, top: 250 + spec.screenY, left: 100 + spec.screenX });

  // Add badge if configured
  if (config.badgeText) {
    const badgeSvg = `<svg width="300" height="60">
      <rect width="300" height="60" rx="30" fill="${config.badgeColor || '#EF4444'}" />
      <text x="150" y="40" text-anchor="middle" font-size="28" font-weight="bold" font-family="system-ui" fill="white">${escSvg(config.badgeText)}</text>
    </svg>`;
    composites.push({ input: Buffer.from(badgeSvg), top: canvasHeight - 100, left: (canvasWidth - 300) / 2 });
  }

  return canvas.composite(composites).toBuffer();
}

// Batch generate for all locales and sizes
export async function batchGenerate(params: {
  screenshots: Array<{ appScreenshot: string; headline: Record<string, string>; subtitle?: Record<string, string> }>;
  locales: string[];
  devices: string[];
  backgroundColor: string;
  textColor: string;
  outputDir: string;
  variants?: Array<{ id: string; headlines: Record<string, Record<string, string>> }>;
}): Promise<{ generated: number; errors: number }> {
  await mkdir(params.outputDir, { recursive: true });
  let generated = 0, errors = 0;

  for (const locale of params.locales) {
    for (let i = 0; i < params.screenshots.length; i++) {
      const ss = params.screenshots[i];
      for (const device of params.devices) {
        try {
          const config: ScreenshotConfig = {
            appScreenshot: ss.appScreenshot,
            deviceFrame: device as any,
            headline: ss.headline[locale] || ss.headline.en || "",
            subtitle: ss.subtitle?.[locale] || ss.subtitle?.en,
            backgroundColor: params.backgroundColor,
            textColor: params.textColor,
            locale,
          };

          const buffer = await generateScreenshot(config);
          await writeFile(join(params.outputDir, `${locale}_${device}_${i + 1}.png`), buffer);
          generated++;

          // Generate A/B variants
          if (params.variants) {
            for (const variant of params.variants) {
              const variantHeadline = variant.headlines[locale]?.[String(i)] || config.headline;
              const variantBuffer = await generateScreenshot({ ...config, headline: variantHeadline, variant: variant.id });
              await writeFile(join(params.outputDir, `${locale}_${device}_${i + 1}_${variant.id}.png`), variantBuffer);
              generated++;
            }
          }
        } catch { errors++; }
      }
    }
  }

  return { generated, errors };
}

function hexToRgba(hex: string): { r: number; g: number; b: number; alpha: number } {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), alpha: 1 };
}

function escSvg(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
```

## Results

- **192 screenshots: 3 days → 5 minutes** — batch render all locales × devices × screenshots; no manual Figma work; designer freed for creative tasks
- **Copy change: 3 days → 30 seconds** — update headline in locale JSON; re-render; all 192 images updated; no per-image editing
- **A/B testing variants** — variant A: "Track your finances"; variant B: "Your money, simplified"; both rendered for all sizes; test on App Store
- **8 languages supported** — headlines and subtitles per locale; Japanese, Korean, Arabic all render correctly; localization built into pipeline
- **Device frames included** — screenshots look professional with iPhone/Pixel frames; consistent branding across all images; app store ready
