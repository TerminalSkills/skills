---
name: material-ui
description: >-
  Material UI (@mui/material) is a React component library that implements Google's Material Design, with ready-made buttons, forms, dialogs, tables, layout grids and a theming system. Use this skill to add MUI to a React or Next.js App Router project, build a brand theme with createTheme and ThemeProvider, style components with the sx prop, set up dark mode with CSS theme variables, or upgrade v5-v7 code to the current v9 API with the official codemods. Trigger phrases: "use Material UI", "set up MUI in Next.js", "MUI theme with our brand colors", "add dark mode toggle to MUI", "fix MUI InputProps error after upgrade".
license: Apache-2.0
compatibility: "React 17, 18 or 19; @mui/material 9.x with @emotion/react and @emotion/styled; Next.js 13-16 via @mui/material-nextjs"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["react", "ui-library", "material-design", "theming", "nextjs"]
  repository: https://github.com/mui/material-ui
---
# Material UI — React components that implement Material Design

## Overview

Material UI is MUI's open-source (MIT) React component library. It ships a large set of accessible components (Button, TextField, Autocomplete, Dialog, Table, Tabs, Drawer, Snackbar and more), layout helpers (`Box`, `Stack`, `Grid`, `Container`) and a theme object that controls palette, typography, spacing, breakpoints and per-component defaults. Styling runs through Emotion by default. The current major is v9 (released April 2026); v9 removed many props that older tutorials and AI models still suggest, so code must follow the v9 API.

Complex data components (Data Grid, Date Pickers, Charts) live in the separate MUI X packages, for example `@mui/x-data-grid`.

## Instructions

### Installation

```bash
npm install @mui/material @emotion/react @emotion/styled
npm install @mui/icons-material        # optional: 2,100+ SVG Material Icons
npm install @fontsource/roboto         # optional: default Roboto font
```

`react` and `react-dom` are peer dependencies. On React 18 or older, pin `react-is` to the same version as React (`npm install react-is@18.3.1` plus an `overrides` entry in package.json), otherwise prop-type checks can throw at runtime.

Add the viewport meta tag to the page head (MUI is mobile-first):

```html
<meta name="viewport" content="initial-scale=1, width=device-width" />
```

For a Vite or other client-rendered app, wrap the root once:

```tsx
// src/main.tsx
import { createRoot } from 'react-dom/client';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import App from './App';

const theme = createTheme({ palette: { primary: { main: '#0f766e' } } });

createRoot(document.getElementById('root')!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <App />
  </ThemeProvider>,
);
```

### Next.js App Router

```bash
npm install @mui/material-nextjs @emotion/cache
```

`AppRouterCacheProvider` collects Emotion styles on the server so they land in `<head>`. Import the entry that matches your Next.js major: `v13-appRouter`, `v14-appRouter`, `v15-appRouter` or `v16-appRouter`. The theme file needs `'use client'` because `createTheme` output contains functions.

```tsx
// src/theme.ts
'use client';
import { createTheme } from '@mui/material/styles';

// Lets <Button variant="dashed"> type-check (see the Theme section below)
declare module '@mui/material/Button' {
  interface ButtonPropsVariantOverrides {
    dashed: true;
  }
}

const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: { palette: { primary: { main: '#0f766e' }, secondary: { main: '#c2410c' } } },
    dark: { palette: { primary: { main: '#2dd4bf' }, secondary: { main: '#fb923c' } } },
  },
  typography: { fontFamily: 'var(--font-inter)', button: { textTransform: 'none' } },
  shape: { borderRadius: 10 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          variants: [
            { props: { variant: 'dashed' }, style: { border: '2px dashed currentColor' } },
          ],
        },
      },
    },
    MuiTextField: { defaultProps: { size: 'small' } },
  },
});

export default theme;
```

```tsx
// src/app/layout.tsx
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import theme from '../theme';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        <InitColorSchemeScript attribute="class" />
        <AppRouterCacheProvider>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
```

`InitColorSchemeScript` sets the saved mode class on `<html>` before paint, which prevents the light-to-dark flash; its `attribute` must match `colorSchemeSelector`, and `suppressHydrationWarning` silences the expected attribute mismatch. If Tailwind or CSS Modules must override MUI, pass `options={{ enableCssLayer: true }}` to `AppRouterCacheProvider` so MUI styles go into `@layer mui`.

### Theme: palette, defaults and custom variants

Keep one `createTheme` call per app; the theme.ts above is the complete file. `colorSchemes` holds the light and dark palettes, `typography` and `shape` set global tokens, and the `components` key sets default props (`defaultProps`) and style overrides for every instance of a component. A new variant such as `dashed` goes in `styleOverrides.root.variants` and needs the `declare module` augmentation in the same file, otherwise `<Button variant="dashed">` fails type checking. The theme is not tree-shaken, so put heavy one-off customization in a wrapper component instead.

### The sx prop and layout

`sx` accepts theme-aware shorthands (`p`, `mb`, `bgcolor`), palette paths as strings (`'text.secondary'`), and responsive objects keyed by breakpoint (`xs`, `sm`, `md`, `lg`, `xl`):

```tsx
<Stack
  direction={{ xs: 'column', sm: 'row' }}
  spacing={2}
  sx={{ p: { xs: 2, md: 3 }, bgcolor: 'background.paper', borderRadius: 2 }}
>
  <Typography variant="h6" component="h2">Open invoices</Typography>
  <Typography sx={{ color: 'text.secondary', fontSize: { xs: 14, md: 16 } }}>
    37 unpaid, 4 overdue
  </Typography>
</Stack>
```

Grid in v9 uses the `size` prop on children; there is no `item` prop and no `xs={6}` shorthand. For vertical stacking use `Stack`; `Grid` no longer accepts `direction="column"`.

```tsx
<Grid container spacing={2}>
  <Grid size={{ xs: 12, md: 8 }}><InvoiceTable /></Grid>
  <Grid size={{ xs: 12, md: 4 }}><PaymentSummary /></Grid>
</Grid>
```

### Dark mode toggle

With `colorSchemes` in the theme, the default mode is `system`. Read and change it with `useColorScheme`; `mode` is `undefined` on the first render, so render nothing until it is set:

```tsx
'use client';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useColorScheme } from '@mui/material/styles';

export default function ModeToggle() {
  const { mode, setMode } = useColorScheme();
  if (!mode) return null;
  return (
    <ToggleButtonGroup size="small" exclusive value={mode}
      onChange={(_, next) => next && setMode(next)} aria-label="Color mode">
      <ToggleButton value="light">Light</ToggleButton>
      <ToggleButton value="system">System</ToggleButton>
      <ToggleButton value="dark">Dark</ToggleButton>
    </ToggleButtonGroup>
  );
}
```

For mode-specific styles use `theme.applyStyles('dark', {...})` instead of checking `theme.palette.mode`, which causes SSR flicker.

### Upgrading older code to v9

The v9 guide covers v7 to v9. Commit first so each codemod's diff is reviewable, then run:

```bash
npm install @mui/material@latest @mui/icons-material@latest @mui/material-nextjs@latest
npx @mui/codemod@latest v9.0.0/system-props src   # <Box mt={2}>, <Stack alignItems>, <Typography fontWeight> -> sx
npx @mui/codemod@latest deprecations/all src      # InputProps, componentsProps and friends -> slotProps
npx tsc --noEmit
```

`deprecations/all` does not touch system props; that is what `v9.0.0/system-props` is for. Fix the rest by hand (for example `GridLegacy` imports and removed `...Outline` icon names).

Coming from v5 or v6, first work through the official upgrade-to-v6 and upgrade-to-v7 guides. In those versions `@mui/material/Grid` is the legacy grid (`<Grid item xs={6}>`); on v9 that import resolves to the new Grid and fails type checking. `npx @mui/codemod@latest v7.0.0/grid-props src` rewrites it to `<Grid size={6}>` and drops `item`. Code that used `Grid2` or `Unstable_Grid2` should import `@mui/material/Grid` instead.

## Examples

### Example 1: Brand theme with dark mode in a Next.js 16 app

**Request:** "Set up MUI in our Next.js 16 App Router project for Northwind Logistics. Teal primary, orange secondary, Inter font, and a light/system/dark switch that doesn't flash on reload."

**What the agent does:** installs `@mui/material @emotion/react @emotion/styled @mui/material-nextjs @emotion/cache`, writes `src/theme.ts` and `src/app/layout.tsx` exactly as in the Next.js section above, and adds `src/components/ModeToggle.tsx` from the dark-mode section to the header.

**Result:** `next build` prerenders the page statically. The HTML contains `--mui-palette-*` CSS variables under `:root,.light` and a `.dark{...}` block; choosing Dark adds `class="dark"` to `<html>`, is saved to localStorage, and survives a reload without a light flash.

### Example 2: Responsive shipment filters with v9 props

**Request:** "Add a filter row above the shipments table: search by tracking number with a search icon, a status dropdown, and an Export button. Fields side by side on desktop, stacked on mobile."

```tsx
'use client';
import { useState } from 'react';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import InputAdornment from '@mui/material/InputAdornment';
import Button from '@mui/material/Button';
import SearchIcon from '@mui/icons-material/Search';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';

const STATUSES = ['In transit', 'Delivered', 'Delayed', 'Returned'];

export default function ShipmentFilters() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('In transit');
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
      <Grid container spacing={2} sx={{ alignItems: 'center' }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField fullWidth label="Tracking number or customer" value={query}
            onChange={(e) => setQuery(e.target.value)}
            slotProps={{
              input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> },
              htmlInput: { maxLength: 40 },
            }} />
        </Grid>
        <Grid size={{ xs: 12, sm: 8, md: 4 }}>
          <TextField select fullWidth label="Status" value={status}
            onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 4, md: 2 }}>
          <Button fullWidth variant="dashed" startIcon={<FileDownloadOutlinedIcon />}>Export CSV</Button>
        </Grid>
      </Grid>
    </Paper>
  );
}
```

**Result:** one row on screens 900px and wider, three stacked rows below 600px. `slotProps.input` replaces the removed `InputProps` and `slotProps.htmlInput` replaces `inputProps`; the older spelling fails type checking in v9 with "Property 'InputProps' does not exist".

## Guidelines

- **Write v9 code.** Removed in v9: system props on Box, Stack, Typography, Grid, Link and DialogContentText (move `mt`, `alignItems`, `fontWeight` and the like into `sx`), `Grid item` and `xs/sm/md` props on Grid (use `size`), `GridLegacy`, `TextField` `InputProps`/`inputProps`/`SelectProps`/`InputLabelProps` (use `slotProps.input`, `.htmlInput`, `.select`, `.inputLabel`), `components`/`componentsProps` on Alert, Autocomplete, Badge, Modal, Tooltip and the Input family (use `slots`/`slotProps`), and 23 icon names ending in `Outline` (use `...Outlined`).
- **Server Components:** MUI components are client components. You may render them from a server `page.tsx`, but only serializable props cross that boundary: an `sx` callback such as `(theme) => theme.applyStyles(...)` or `component={Link}` with `next/link` fails the build with "Functions cannot be passed directly to Client Components". Move that code into a `'use client'` file, or re-export `next/link` from a `'use client'` wrapper.
- Wrap client subtrees that call `useSearchParams()` in `<Suspense>` with a `Skeleton` fallback sized like the real UI to avoid layout shift.
- Prefer path imports (`@mui/material/Button`, `@mui/icons-material/Search`). Production builds tree-shake either way, but barrel imports from `@mui/material` or `@mui/icons-material` make dev startup and rebuilds much slower; `npx @mui/codemod@latest v5.0.0/path-imports src` converts them.
- Emotion is the supported engine for SSR; the styled-components engine (`@mui/styled-engine-sc`) does not work with server rendering.
- Default browser targets in v9: Chrome 117, Edge 121, Firefox 121, Safari 17. Older browsers need your own transpilation.
- MUI X is open-core: `@mui/x-data-grid`, `@mui/x-date-pickers` and `@mui/x-charts` are MIT, while the `-pro` and `-premium` packages (column pinning, range pickers and more) need a commercial license key.
- Do not load Material UI from a CDN in production; it pulls the whole library.
- **When not to use it:** if the team wants Tailwind-first components they own as source code, use shadcn-ui; for a non-Material look with hooks and fewer overrides, consider Mantine; for an enterprise admin look with built-in form and table patterns, Ant Design. Mixing two component libraries in one app doubles bundle size and styling rules.
- MUI publishes official agent skills for Next.js, theming, styling and Tailwind in the repository's `skills/` folder; they go deeper on each of those topics.
