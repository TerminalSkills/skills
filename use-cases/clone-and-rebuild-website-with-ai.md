---
title: "Clone and Rebuild Any Website with AI"
description: "Use AI agents to reverse-engineer any website, extract its design system, and rebuild it as a modern Next.js app — pixel-perfect clone in under an hour."
skills:
  - clone-website
  - image-compare
  - web-design
difficulty: intermediate
time_estimate: "1-2 hours"
tags: [website-cloning, design, next-js, ai-automation, landing-page]
---

# Clone and Rebuild Any Website with AI

## The Scenario

Sara is a startup founder building a developer tools company. She needs a professional landing page *yesterday* — investors are coming next week, and the current site is a basic HTML template from 2019.

She loves how [Linear.app](https://linear.app) looks: clean typography, smooth scroll animations, dark theme with vibrant accents, and a layout that screams "we're serious about craft." Hiring a designer would cost $5k+ and take weeks. Instead, she'll use the **clone-website** skill to reverse-engineer Linear's design in under an hour, then customize it with her own brand.

## What You'll Build

- A pixel-perfect Next.js clone of any target website
- Extracted design system (colors, fonts, spacing, breakpoints)
- Responsive components built with Tailwind CSS
- Production-ready deployment on Vercel

## Prerequisites

- **Node.js 20+** installed
- **Claude Code** with Chrome MCP configured
- **Git** for version control
- A target website URL (we'll use `https://linear.app` as our example)
- ~30 minutes of patience while AI agents do the heavy lifting

---

## Step 1: Set Up the Cloner Template

Start by cloning the ai-website-cloner-template — this gives you the project structure, configuration files, and all the skill infrastructure.

```bash
git clone https://github.com/JCodesMore/ai-website-cloner-template.git saras-landing-page
cd saras-landing-page
npm install
```

The template includes:
- Next.js 14 with App Router
- Tailwind CSS preconfigured
- The clone-website skill in `.claude/skills/`
- Git worktree setup for parallel building

## Step 2: Configure Your Target

Edit `TARGET.md` in the project root to define what you're cloning:

```markdown
# Target: Linear.app Homepage

## URL
https://linear.app

## Scope
- Homepage only (single page)
- Hero section through footer
- All scroll animations
- Dark theme

## Priority Sections
1. Navigation bar (sticky, blur backdrop)
2. Hero with animated headline
3. Feature showcase grid
4. Social proof / logos
5. CTA section
6. Footer

## Notes
- Focus on visual fidelity, not functional features
- Skip interactive demos/videos — use placeholder images
- Capture the exact color palette and typography
```

## Step 3: Launch the Clone

This is where the magic happens. Run the clone-website skill with your target URL:

```bash
claude "/clone-website https://linear.app"
```

The skill kicks off an automated pipeline. Sit back and watch — or grab coffee.

## Step 4: Reconnaissance Phase (Automated)

The skill's first phase captures everything about the target site:

**What happens automatically:**
- Chrome MCP opens the target URL
- Screenshots taken at 5 breakpoints: 320px, 768px, 1024px, 1280px, 1920px
- Full-page screenshot for complete layout reference
- CSS computed styles extracted for every visible element
- Font files identified and downloaded
- Color palette extracted (backgrounds, text, accents, borders)
- Spacing system reverse-engineered (margins, paddings, gaps)

**Output created:**
```
recon/
├── screenshots/
│   ├── 320w.png
│   ├── 768w.png
│   ├── 1024w.png
│   ├── 1280w.png
│   └── 1920w.png
├── design-tokens.json     # Colors, fonts, spacing
├── section-map.md         # Identified sections with coordinates
└── assets/                # Downloaded fonts, SVGs, images
```

You'll see the extracted design tokens — something like:

```json
{
  "colors": {
    "bg-primary": "#0A0A0B",
    "bg-secondary": "#141415",
    "text-primary": "#F2F2F2",
    "text-secondary": "#8A8A8E",
    "accent": "#5E6AD2",
    "accent-hover": "#7B84E0"
  },
  "fonts": {
    "heading": "Inter, -apple-system, sans-serif",
    "body": "Inter, -apple-system, sans-serif",
    "mono": "JetBrains Mono, monospace"
  },
  "spacing": {
    "section-gap": "120px",
    "container-max": "1200px",
    "container-padding": "24px"
  }
}
```

## Step 5: Foundation Setup (Automated)

The skill configures your Next.js project with the extracted design system:

- **Tailwind config** updated with exact colors, fonts, and breakpoints
- **Global CSS** set with base styles, font imports, and CSS variables
- **Font files** copied to `public/fonts/` and loaded via `next/font`
- **Layout component** created with proper meta tags and theme

No manual work needed — the foundation matches the target's design system exactly.

## Step 6: Component Spec Generation (Automated)

For each identified section, the skill generates a detailed component spec:

```markdown
## Section: Hero
- **Bounding box:** 0,0 → 1920,900
- **Background:** linear-gradient(180deg, #0A0A0B 0%, #141415 100%)
- **Headline:** "Linear is a better way to build products"
  - Font: Inter 64px/1.1 bold, color #F2F2F2
  - Max-width: 800px, centered
- **Subheadline:** "Meet the new standard for modern software development..."
  - Font: Inter 20px/1.6 regular, color #8A8A8E
  - Max-width: 560px, centered, margin-top: 24px
- **CTA Button:** "Get Started" 
  - Padding: 12px 24px, bg #5E6AD2, border-radius 8px
  - Hover: bg #7B84E0, transition 150ms ease
- **Animation:** Fade-in on load, 600ms delay staggered
```

These specs give the builder agents *exact* values — no guessing.

## Step 7: Parallel Building (Automated)

This is the skill's superpower. Instead of building sections one-by-one, it dispatches **parallel builder agents** in separate git worktrees:

```
Builder Agent 1 → worktree/hero     → Hero section
Builder Agent 2 → worktree/features → Feature grid
Builder Agent 3 → worktree/social   → Social proof section
Builder Agent 4 → worktree/cta      → CTA section
Builder Agent 5 → worktree/footer   → Footer
```

Each agent:
1. Reads its section's component spec
2. References the corresponding screenshot crop
3. Builds the component with exact CSS values
4. Creates responsive variants for all breakpoints
5. Commits to its worktree branch

**5 sections built simultaneously** instead of sequentially — this is why it's fast.

## Step 8: Assembly (Automated)

Once all builder agents complete, the skill merges everything:

1. Worktree branches merged into main
2. Page component wired up with all sections in order
3. Shared components deduplicated (buttons, containers)
4. Scroll animations connected
5. Final `page.tsx` assembled

```tsx
// app/page.tsx (generated)
import { Hero } from '@/components/sections/Hero'
import { Features } from '@/components/sections/Features'
import { SocialProof } from '@/components/sections/SocialProof'
import { CTA } from '@/components/sections/CTA'
import { Footer } from '@/components/sections/Footer'

export default function Home() {
  return (
    <main className="bg-bg-primary min-h-screen">
      <Hero />
      <Features />
      <SocialProof />
      <CTA />
      <Footer />
    </main>
  )
}
```

## Step 9: Visual QA

Now compare your clone against the original. The skill runs automated visual comparison:

```bash
# The skill automatically captures your clone at all breakpoints
# and compares against the recon screenshots

npm run dev  # Start the dev server
# Skill captures localhost:3000 screenshots
# Runs pixel-diff against original screenshots
```

You'll get a visual diff report showing:
- **Green overlay:** Matching pixels
- **Red overlay:** Differences that need fixing
- **Similarity score:** Target is >95% match

If sections are off, the skill iterates — adjusting spacing, colors, or fonts until the diff passes.

## Step 10: Make It Yours

Now the fun part — Sara customizes the clone for her startup:

### Swap the Copy
```tsx
// Before (cloned from Linear)
<h1>Linear is a better way to build products</h1>

// After (Sara's startup)
<h1>Ship faster with AI-powered code review</h1>
```

### Update Brand Colors
```js
// tailwind.config.js
colors: {
  'bg-primary': '#0A0A0B',      // Keep the dark theme
  'accent': '#10B981',           // Green instead of purple
  'accent-hover': '#34D399',
}
```

### Modify CTAs
```tsx
// Swap "Get Started" for Sara's flow
<Button href="/waitlist">Join the Waitlist</Button>
```

### Add Your Logo and Images
```bash
# Replace placeholder assets
cp ~/brand/logo.svg public/logo.svg
cp ~/brand/hero-screenshot.png public/images/hero.png
```

### Fine-tune Animations
The cloned animations are already in place. Adjust timing or add new ones:
```css
/* Slow down the hero fade-in for more drama */
.hero-animate {
  animation-duration: 800ms;  /* was 600ms */
}
```

## Step 11: Deploy to Vercel

Sara's landing page is ready. Deploy it:

```bash
# Install Vercel CLI if needed
npm i -g vercel

# Deploy
vercel

# Or connect to Git for auto-deploys
vercel link
git add -A
git commit -m "feat: launch landing page"
git push origin main
```

**That's it.** Sara has a professional, responsive, dark-themed landing page that looks like it was designed by a $200/hr agency — built in under an hour.

---

## Results

| Metric | Traditional | With clone-website |
|--------|------------|-------------------|
| Time to landing page | 2-4 weeks | 1-2 hours |
| Design cost | $3,000-$10,000 | $0 |
| Responsive breakpoints | Often 2-3 | 5 (320-1920px) |
| Design system extracted | No | Yes (tokens.json) |
| Iteration speed | Days | Minutes |

## Tips and Gotchas

1. **Respect copyright.** Clone for *inspiration and learning*, not to steal someone's brand. Always customize heavily before going live.
2. **Complex animations** (WebGL, Three.js, Lottie) won't clone perfectly — you'll need to simplify or recreate them.
3. **Dynamic content** (carousels, tabs, dropdowns) gets captured in their default state. Add interactivity manually.
4. **Images are placeholders.** The skill downloads visible images but you should replace them with your own assets.
5. **Test on real devices.** The visual QA catches most issues, but always check on actual phones and tablets.
6. **Start simple.** Clone a single page first. Multi-page sites work but take proportionally longer.

## Related Skills

- **clone-website** — The core skill powering this workflow
- **image-compare** — Visual diff tool for QA comparison
- **web-design** — Design system generation and component architecture

## Credits

Based on [ai-website-cloner-template](https://github.com/JCodesMore/ai-website-cloner-template) by JCodesMore.
