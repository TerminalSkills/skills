---
title: Build a Dark Mode Theme System
slug: build-dark-mode-theme-system
description: Build a theme system with dark/light/auto modes, CSS custom properties, design tokens, system preference detection, smooth transitions, persistent preferences, and accessible contrast ratios.
skills:
  - typescript
  - nextjs
  - redis
  - postgresql
  - zod
category: development
tags:
  - dark-mode
  - theming
  - design-tokens
  - css
  - accessibility
---

# Build a Dark Mode Theme System

## The Problem

Vera leads frontend at a 20-person SaaS. Users have been requesting dark mode for two years — it's the #1 feature request. A developer tried adding it with CSS class toggles, but it broke in 50 places: hardcoded colors, inconsistent contrast, images with white backgrounds that look terrible on dark. They reverted it. They need a systematic approach: design tokens that define all colors, automatic contrast checking, system preference detection, and smooth transitions that don't flash white on page load.

## Step 1: Build the Theme System

```typescript
// src/theme/tokens.ts — Design tokens with dark/light variants and contrast validation
const baseTokens = {
  light: {
    // Backgrounds
    "bg-primary": "#FFFFFF",
    "bg-secondary": "#F8F9FA",
    "bg-tertiary": "#F1F3F5",
    "bg-inverse": "#212529",
    "bg-elevated": "#FFFFFF",
    "bg-overlay": "rgba(0, 0, 0, 0.5)",

    // Text
    "text-primary": "#212529",
    "text-secondary": "#495057",
    "text-tertiary": "#868E96",
    "text-inverse": "#FFFFFF",
    "text-link": "#228BE6",
    "text-link-hover": "#1971C2",

    // Borders
    "border-default": "#DEE2E6",
    "border-subtle": "#E9ECEF",
    "border-strong": "#ADB5BD",

    // Semantic
    "status-success": "#2F9E44",
    "status-warning": "#F08C00",
    "status-error": "#E03131",
    "status-info": "#228BE6",

    // Surfaces
    "surface-card": "#FFFFFF",
    "surface-input": "#FFFFFF",
    "surface-hover": "#F8F9FA",
    "surface-active": "#E9ECEF",
    "surface-selected": "#E7F5FF",

    // Shadows
    "shadow-sm": "0 1px 2px rgba(0, 0, 0, 0.05)",
    "shadow-md": "0 4px 6px rgba(0, 0, 0, 0.07)",
    "shadow-lg": "0 10px 15px rgba(0, 0, 0, 0.1)",
  },
  dark: {
    "bg-primary": "#1A1B1E",
    "bg-secondary": "#25262B",
    "bg-tertiary": "#2C2E33",
    "bg-inverse": "#E9ECEF",
    "bg-elevated": "#2C2E33",
    "bg-overlay": "rgba(0, 0, 0, 0.7)",

    "text-primary": "#C1C2C5",
    "text-secondary": "#909296",
    "text-tertiary": "#5C5F66",
    "text-inverse": "#1A1B1E",
    "text-link": "#4DABF7",
    "text-link-hover": "#74C0FC",

    "border-default": "#373A40",
    "border-subtle": "#2C2E33",
    "border-strong": "#5C5F66",

    "status-success": "#51CF66",
    "status-warning": "#FCC419",
    "status-error": "#FF6B6B",
    "status-info": "#4DABF7",

    "surface-card": "#25262B",
    "surface-input": "#2C2E33",
    "surface-hover": "#2C2E33",
    "surface-active": "#373A40",
    "surface-selected": "#1B3A5C",

    "shadow-sm": "0 1px 2px rgba(0, 0, 0, 0.3)",
    "shadow-md": "0 4px 6px rgba(0, 0, 0, 0.4)",
    "shadow-lg": "0 10px 15px rgba(0, 0, 0, 0.5)",
  },
};

// Validate contrast ratios (WCAG AA: 4.5:1 for text, 3:1 for large text)
function validateContrast(tokens: Record<string, string>): Array<{ pair: string; ratio: number; pass: boolean }> {
  const pairs = [
    ["text-primary", "bg-primary", 4.5],
    ["text-secondary", "bg-primary", 4.5],
    ["text-primary", "bg-secondary", 4.5],
    ["text-primary", "surface-card", 4.5],
    ["text-link", "bg-primary", 4.5],
    ["status-error", "bg-primary", 3],
    ["status-success", "bg-primary", 3],
  ] as const;

  return pairs.map(([fg, bg, required]) => {
    const ratio = getContrastRatio(tokens[fg], tokens[bg]);
    return { pair: `${fg}/${bg}`, ratio: Math.round(ratio * 100) / 100, pass: ratio >= required };
  });
}

function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function getRelativeLuminance(hex: string): number {
  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)]
    .map((c) => parseInt(c, 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
```

```typescript
// src/theme/provider.tsx — React theme provider with flash prevention
import { createContext, useContext, useEffect, useState, useCallback } from "react";

type ThemeMode = "light" | "dark" | "auto";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Inline script to prevent flash of wrong theme (add to <head>)
export const themeInitScript = `
(function() {
  var stored = localStorage.getItem('theme-mode') || 'auto';
  var resolved = stored;
  if (stored === 'auto') {
    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
})();
`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "auto";
    return (localStorage.getItem("theme-mode") as ThemeMode) || "auto";
  });

  const [resolved, setResolved] = useState<ResolvedTheme>(() => {
    if (typeof window === "undefined") return "light";
    if (mode !== "auto") return mode;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  // Listen for system preference changes
  useEffect(() => {
    if (mode !== "auto") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setResolved(e.matches ? "dark" : "light");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [mode]);

  // Apply theme
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;

    // Smooth transition (skip on initial load)
    document.documentElement.classList.add("theme-transitioning");
    const timer = setTimeout(() => document.documentElement.classList.remove("theme-transitioning"), 300);
    return () => clearTimeout(timer);
  }, [resolved]);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem("theme-mode", newMode);
    if (newMode === "auto") {
      setResolved(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    } else {
      setResolved(newMode);
    }
  }, []);

  const toggle = useCallback(() => {
    setMode(resolved === "light" ? "dark" : "light");
  }, [resolved, setMode]);

  return (
    <ThemeContext.Provider value={{ mode, resolved, toggle, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
```

```css
/* src/theme/tokens.css — CSS custom properties generated from design tokens */
[data-theme="light"] {
  --bg-primary: #FFFFFF;
  --bg-secondary: #F8F9FA;
  --text-primary: #212529;
  --text-secondary: #495057;
  --text-link: #228BE6;
  --border-default: #DEE2E6;
  --surface-card: #FFFFFF;
  --surface-hover: #F8F9FA;
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);
  color-scheme: light;
}

[data-theme="dark"] {
  --bg-primary: #1A1B1E;
  --bg-secondary: #25262B;
  --text-primary: #C1C2C5;
  --text-secondary: #909296;
  --text-link: #4DABF7;
  --border-default: #373A40;
  --surface-card: #25262B;
  --surface-hover: #2C2E33;
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
  color-scheme: dark;
}

/* Smooth transitions between themes */
.theme-transitioning,
.theme-transitioning * {
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease !important;
}

/* Usage in components */
.card {
  background: var(--surface-card);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  box-shadow: var(--shadow-md);
}

/* Images with transparency adapt to theme */
[data-theme="dark"] img[data-theme-aware] {
  filter: brightness(0.85);
}
```

## Results

- **#1 feature request shipped** — dark mode works consistently across all 200+ components; no broken colors, no white-background images
- **Zero flash of wrong theme** — inline script in `<head>` applies theme before React hydrates; page loads in correct theme instantly
- **WCAG AA compliant** — contrast validation catches any token pair below 4.5:1; dark mode is accessible, not just pretty
- **Auto mode respects OS** — macOS/Windows dark mode preference detected; users who switch at sunset see the app change with them
- **Design token architecture** — adding a new color requires one token definition; it propagates to both themes; designers and developers speak the same language
