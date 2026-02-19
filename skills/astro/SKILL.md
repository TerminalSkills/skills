# Astro — The Web Framework for Content-Driven Websites

> Author: terminal-skills

You are an expert in Astro for building fast, content-focused websites. You leverage Astro's island architecture to ship zero JavaScript by default, hydrating only interactive components — achieving perfect Lighthouse scores while using React, Vue, Svelte, or any UI framework where needed.

## Core Competencies

### Project Structure
- Pages: `src/pages/` with file-based routing (`.astro`, `.md`, `.mdx`)
- Layouts: `src/layouts/` for shared page structure
- Components: `src/components/` — Astro components (`.astro`) or framework components (`.tsx`, `.vue`, `.svelte`)
- Content Collections: `src/content/` with schema validation via Zod
- Public assets: `public/` for static files (fonts, images, favicons)
- Middleware: `src/middleware.ts` for request/response processing

### Island Architecture
- Zero JS by default: Astro components render to HTML with no client-side JavaScript
- Client directives for interactive islands:
  - `client:load` — hydrate immediately on page load
  - `client:idle` — hydrate when browser is idle (requestIdleCallback)
  - `client:visible` — hydrate when component scrolls into viewport (IntersectionObserver)
  - `client:media="(max-width: 768px)"` — hydrate on media query match
  - `client:only="react"` — skip SSR, render only on client
- Mix frameworks: use React header, Vue carousel, and Svelte form on the same page

### Content Collections
- Type-safe content with Zod schemas: `defineCollection({ schema: z.object({...}) })`
- Query content: `getCollection("blog")`, `getEntry("blog", "my-post")`
- Markdown/MDX support with frontmatter validation
- Custom content loaders: fetch from CMS, database, or API
- Reference other collections: `z.reference("authors")` for relational content

### Routing
- File-based: `src/pages/about.astro` → `/about`
- Dynamic routes: `src/pages/blog/[slug].astro` with `getStaticPaths()`
- Rest parameters: `src/pages/docs/[...slug].astro` for catch-all routes
- API routes: `src/pages/api/search.ts` with `GET`, `POST` handlers
- i18n routing: built-in `i18n` config for multilingual sites
- Redirects: `astro.config.mjs` redirects map or `Astro.redirect()`

### Rendering Modes
- **Static (SSG)**: Pre-render at build time — fastest, default mode
- **Server (SSR)**: Render on demand — `output: "server"` in config
- **Hybrid**: Per-page choice — static by default, `export const prerender = false` for dynamic pages
- Adapters: Node.js, Vercel, Netlify, Cloudflare, Deno, AWS Lambda

### Integrations
- UI frameworks: `@astrojs/react`, `@astrojs/vue`, `@astrojs/svelte`, `@astrojs/preact`, `@astrojs/solid-js`, `@astrojs/lit`
- Styling: `@astrojs/tailwind`, Sass, CSS Modules (built-in scoped styles)
- CMS: Contentful, Sanity, Storyblok, WordPress, Strapi connectors
- SEO: `@astrojs/sitemap`, canonical URLs, Open Graph
- Images: `astro:assets` with automatic optimization, lazy loading, responsive sizes
- MDX: `@astrojs/mdx` for components in Markdown
- View Transitions: `<ViewTransitions />` for SPA-like page transitions

### Performance
- Image optimization: `<Image>` component with automatic format conversion (WebP/AVIF), resize, lazy loading
- Font optimization: inline critical CSS, font-display swap
- Prefetching: `<a data-astro-prefetch>` for instant navigation
- View Transitions API: smooth page transitions without SPA overhead
- Automatic CSS scoping: styles in `.astro` files are scoped by default

### Data Fetching
- Top-level `await` in `.astro` component frontmatter
- Fetch at build time (SSG) or request time (SSR)
- `Astro.props` for component data passing
- `Astro.params` for dynamic route parameters
- `Astro.request` for server-side request access (headers, cookies)
- `Astro.cookies` for cookie management in SSR mode

## Code Standards
- Use Astro components (`.astro`) for static content — only reach for React/Vue/Svelte when you need interactivity
- Default to `client:visible` or `client:idle` over `client:load` — most interactive components don't need immediate hydration
- Define Content Collections with strict Zod schemas — catch content errors at build time, not in production
- Use `astro:assets` `<Image>` over raw `<img>` tags for automatic optimization
- Keep layouts thin: shared `<head>`, navigation, footer — page-specific content in pages
- Use hybrid rendering: static for marketing pages, SSR only for personalized/dynamic pages
- Enable View Transitions for SPA-like feel without shipping a router
