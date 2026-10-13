---
name: blog-article-design
description: >-
  Design and implement high-quality blog post and article page layouts with
  professional typography, spacing, and visual hierarchy. Use when building
  blog pages, article templates, technical documentation readers, use-case
  pages, or long-form content layouts. Covers dark and light themes.
license: Apache-2.0
compatibility: "Tailwind CSS 3+, React or any component framework"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: design
  tags: ["blog-design", "typography", "article-layout", "content-design", "tailwind"]
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Blog & Article Design

## Overview

Professional design system for blog posts, articles, and long-form content pages. Provides specific typography scales, spacing rules, code block styling, and visual hierarchy guidelines optimized for readability on both dark and light themes. The `accent` color used below is a theme token you define in your Tailwind config (the examples use `emerald-400`, which you can substitute).

## Instructions

When designing or improving a blog/article page, follow these steps in order.

### Step 1: Set the content container

The single most important decision is content width. Optimal reading length is 60-70 characters per line.

```
Container width: max-w-2xl (672px) for prose-heavy articles
                 max-w-3xl (768px) if content includes wide code blocks or tables
Centering:       mx-auto
Horizontal pad:  px-6 (24px on each side)
Top padding:     pt-24 (96px) to clear fixed headers
Bottom padding:  pb-16 (64px)
```

Never use `max-w-4xl` or wider for article text — lines become too long to read comfortably.

### Step 2: Define the typography scale

Use a constrained type scale with clear hierarchy. Every level must be visually distinct.

**Dark theme (zinc palette):**
```
H1:     text-3xl md:text-4xl font-bold text-zinc-50          — Page title, one per page
H2:     text-2xl font-semibold tracking-tight text-zinc-50   — Major sections, mt-12 mb-4
H3:     text-xl font-semibold tracking-tight text-zinc-50    — Subsections, mt-8 mb-3
H4:     text-lg font-semibold text-zinc-100                  — Minor headings, mt-6 mb-2
Body:   text-base leading-7 text-zinc-300 mb-6               — Paragraphs, 16px/28px
Strong: text-zinc-50 font-semibold                           — Emphasis within body
Muted:  text-zinc-400                                        — Captions, metadata
Link:   text-accent underline decoration-accent/40           — Visible, accessible links
```

**Light theme (gray palette):**
```
H1:     text-3xl md:text-4xl font-bold text-gray-900
H2:     text-2xl font-semibold tracking-tight text-gray-900
H3:     text-xl font-semibold tracking-tight text-gray-900
Body:   text-base leading-7 text-gray-600 mb-6
Strong: text-gray-900 font-semibold
Muted:  text-gray-500
```

Key rules:
- Body line-height must be `leading-7` (1.75) for comfortable reading
- Paragraph spacing `mb-6` creates clear separation without feeling sparse
- Headings use `tracking-tight` for a polished, dense feel
- H2 gets `mt-12` — generous top margin signals a new major section

### Step 3: Style lists and inline elements

```
Unordered: list-disc list-outside pl-6 space-y-2 text-zinc-300 my-6
Ordered:   list-decimal list-outside pl-6 space-y-2 text-zinc-300 my-6
List item: text-base leading-7
Inline code: bg-white/10 px-1.5 py-0.5 rounded-md text-[0.9em] font-mono text-zinc-200
Blockquote: border-l-4 border-zinc-700 pl-4 my-6 text-zinc-400 italic
Horizontal rule: border-white/10 my-12
```

For ordered lists interrupted by other elements (code blocks), preserve the `start` attribute to maintain correct numbering.

### Step 4: Design code blocks

Two distinct code block types:

**Language-tagged blocks (syntax-highlighted code):**
```
Container: my-6 rounded-xl border border-white/10 bg-zinc-900 overflow-hidden
Header:    flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-zinc-900/80
Lang label: text-xs font-mono text-zinc-400
Code area: px-5 py-4 overflow-x-auto
Pre:       text-sm leading-relaxed whitespace-pre-wrap break-words
```

**Text/output blocks (untagged or `text` language):**
```
Container: my-6 rounded-xl border border-white/10 bg-zinc-900 overflow-x-auto
Pre:       px-5 py-4 text-sm leading-relaxed whitespace-pre-wrap break-words font-mono
```

For output blocks, apply line-by-line visual hierarchy:
- First non-empty line → `text-zinc-50 font-semibold` (title)
- ALL CAPS lines → `text-zinc-100 font-medium` (section header)
- Lines ending with `:` (under 60 chars) → section header style
- Numbered items (`1. ...`) → `text-zinc-200`
- Divider lines (`---`, `===`) → `text-zinc-700`
- Dollar amounts, percentages → `text-emerald-400` highlight
- Everything else → `text-zinc-400` (body)
- Blank lines → `h-3` spacer

### Step 5: Design tables

```
Wrapper:  overflow-x-auto my-6 rounded-xl border border-white/10
Table:    w-full text-sm border-collapse
Thead:    bg-zinc-900/50
Th:       text-left py-3 px-4 text-zinc-200 font-semibold text-xs uppercase tracking-wider
Tr:       border-b border-white/5
Td:       py-3 px-4 text-zinc-300
```

### Step 6: Add page-level structure

A well-structured article page has these sections in order:

```
1. Breadcrumb — text-sm text-muted, links with hover:text-white
2. Title — H1, single line preferred, bold
3. Metadata bar — category badge, tags, author, date (flex-wrap gap-3)
4. Related resources — linked cards (if applicable)
5. Article body — markdown-rendered content
6. Footer — related articles, share buttons (optional)
```

Category badge style: `text-xs bg-accent/20 text-accent px-2 py-1 rounded capitalize`
Tags: `text-xs text-muted` with `#` prefix

### Step 7: Responsive behavior

```
Mobile (<640px):  px-6, text-3xl title, full-width code blocks
Tablet (640px+):  Same as mobile but wider line length
Desktop (768px+): text-4xl title, centered container
```

Code blocks should use `overflow-x-auto` on mobile and `whitespace-pre-wrap break-words` to avoid horizontal scroll when possible.

## Examples

### Example 1: React markdown component overrides for a dark-theme article

**User request:** "Create custom markdown components for my blog's article pages with a dark theme"

**Implementation:**
```tsx
import React from 'react'

export const markdownComponents = {
  h1: () => null, // Title rendered separately above the article
  h2: ({ children }: any) => (
    <h2 className="text-2xl font-semibold tracking-tight text-zinc-50 mt-12 mb-4">{children}</h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="text-xl font-semibold tracking-tight text-zinc-50 mt-8 mb-3">{children}</h3>
  ),
  p: ({ children }: any) => (
    <p className="text-base leading-7 text-zinc-300 mb-6">{children}</p>
  ),
  strong: ({ children }: any) => (
    <strong className="text-zinc-50 font-semibold">{children}</strong>
  ),
  a: ({ href, children }: any) => (
    <a href={href} className="text-emerald-400 underline decoration-emerald-400/40 underline-offset-2 hover:decoration-emerald-400 transition-colors" target="_blank" rel="noopener noreferrer">{children}</a>
  ),
  ul: ({ children }: any) => (
    <ul className="list-disc list-outside pl-6 space-y-2 text-zinc-300 my-6">{children}</ul>
  ),
  ol: ({ children, start }: any) => (
    <ol start={start} className="list-decimal list-outside pl-6 space-y-2 text-zinc-300 my-6">{children}</ol>
  ),
  li: ({ children }: any) => (
    <li className="text-base leading-7 [&>p]:mb-0">{children}</li>
  ),
  code: ({ className, children }: any) => {
    if (className?.includes('language-')) return <code className={className}>{children}</code>
    return <code className="bg-white/10 px-1.5 py-0.5 rounded-md text-[0.9em] font-mono text-zinc-200">{children}</code>
  },
  pre: ({ children }: any) => (
    <div className="my-6 rounded-xl border border-white/10 bg-zinc-900 overflow-x-auto">
      <pre className="px-5 py-4 text-sm leading-relaxed whitespace-pre-wrap break-words">{children}</pre>
    </div>
  ),
  table: ({ children }: any) => (
    <div className="overflow-x-auto my-6 rounded-xl border border-white/10">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-zinc-700 pl-4 my-6 text-zinc-400 italic [&>p]:mb-0">{children}</blockquote>
  ),
}
```

### Example 2: Article page layout with breadcrumbs and metadata

**User request:** "Build a use-case article page with a breadcrumb, title, category badge, and markdown body"

**Implementation:**
```tsx
export default function ArticlePage({ article }) {
  return (
    <main className="pt-24 pb-16">
      <div className="max-w-2xl mx-auto px-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-zinc-500 mb-8">
          <a href="/articles" className="hover:text-white transition-colors">Articles</a>
          <span>/</span>
          <span className="text-white">{article.title}</span>
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-bold text-zinc-50 mb-4">
          {article.title}
        </h1>

        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded capitalize">
            {article.category}
          </span>
          {article.tags.map(tag => (
            <span key={tag} className="text-xs text-zinc-500">#{tag}</span>
          ))}
        </div>

        {/* Article body */}
        <article>
          <ReactMarkdown components={markdownComponents}>
            {article.body}
          </ReactMarkdown>
        </article>
      </div>
    </main>
  )
}
```

## Guidelines

- **65-70 characters per line** is the optimal reading width. `max-w-2xl` achieves this at 16px body text. Never go wider for prose.
- **Vertical rhythm matters.** Consistent `mb-6` on paragraphs and `my-6` on blocks creates a predictable reading pace. Headings break the rhythm intentionally with larger top margins.
- **Code blocks are visual anchors.** They should stand out from prose with distinct borders and background. The `rounded-xl border border-white/10 bg-zinc-900` pattern creates a clean, contained look.
- **Do not over-style output blocks.** Simple monospace with subtle hierarchy (title bold, sections medium, body regular) is more readable than heavy formatting.
- **Tables need horizontal overflow.** Always wrap in `overflow-x-auto` to handle narrow viewports.
- **Links must be visually distinct.** Use both color and underline — color alone fails for colorblind users. The `underline-offset-2` with partial-opacity decoration is clean.
- **Suppress the H1 in markdown rendering** when the page title is already displayed above the article body. Duplicate titles look broken.
- **Test with real content.** Placeholder text hides spacing issues that only appear with actual paragraphs, lists, and code blocks.
- **Dark theme contrast:** body text at `zinc-300` (#d4d4d8) on `#09090b` background gives about 13.5:1 contrast ratio. Headings at `zinc-50` (#fafafa) give about 19:1. Muted `zinc-400` (#a1a1aa) gives about 7.8:1. All above WCAG AA's 4.5:1 for body text. `zinc-500` (about 4.1:1) falls short of 4.5:1 for small text, so use `zinc-400` for small labels such as the code-block language tag.
