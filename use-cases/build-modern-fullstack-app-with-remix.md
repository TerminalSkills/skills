---
title: "Build a Modern Fullstack App with Remix and Server-Side Rendering"
slug: build-modern-fullstack-app-with-remix
description: "Create a performant fullstack application using Remix with server-side rendering, client state management, and progressive enhancement."
skills:
  - remix
  - zustand
  - ssr-migration
category: development
tags:
  - remix
  - ssr
  - fullstack
  - state-management
  - react
---

# Build a Modern Fullstack App with Remix and Server-Side Rendering

## The Problem

Your team's React SPA has grown into a 2.5MB JavaScript bundle that takes 4 seconds to become interactive on mobile. Search engines cannot index product pages because content renders client-side. The app fetches data in useEffect waterfalls -- the product page loads the shell, then fetches the product, then fetches reviews, then fetches recommendations, each waiting for the previous one. Users on slower connections stare at loading spinners for 6 seconds. Moving to server-side rendering feels like a rewrite, and managing the split between server data and client interactivity state is unclear.

## The Solution

Use the **remix** skill to build the application with nested routes and server-side data loading that eliminates fetch waterfalls, the **ssr-migration** skill to migrate existing client-rendered pages to server-rendered ones incrementally, and **zustand** to manage client-only interactive state like shopping cart contents, filter selections, and UI preferences without conflicting with server data.

## Step-by-Step Walkthrough

### 1. Set up Remix with nested route data loading

Replace client-side fetch waterfalls with parallel server loaders.

> Create a Remix route for our product detail page at /products/$slug. The loader should fetch the product, reviews, and recommendations in parallel on the server. Return all data in a single response so the page renders fully on first paint with no loading spinners.

Remix loaders run on the server before any HTML is sent to the browser. The product page goes from three sequential client fetches to one server response.

### 2. Migrate existing SPA pages incrementally

Convert the highest-traffic pages first without rewriting the entire app at once.

> I have 45 React SPA routes. Help me migrate the top 5 by traffic (homepage, product listing, product detail, search results, checkout) to Remix server-rendered routes. Keep the remaining 40 routes as client-rendered for now using a catch-all route. Show me how to share the existing React components between both.

### 3. Add client state management with Zustand

Some state is purely client-side and should not touch the server -- cart items, UI preferences, filter toggles.

> Set up Zustand stores for the shopping cart (items, quantities, coupon codes) and UI state (sidebar open/closed, selected filters, sort order). The cart store should persist to localStorage so items survive page refreshes. Make sure Zustand hydration does not cause SSR mismatches.

The key pattern is separating server data (loader) from client state (Zustand). Product data comes from the server. Whether the user has that product in their cart is client state.

### 4. Add progressive enhancement for forms

Remix forms work without JavaScript, then enhance with client-side validation when JS loads.

> Convert the checkout form to use Remix's Form component with server-side action validation. Add client-side validation with Zod that mirrors the server schema. The form should submit and work correctly even if JavaScript fails to load.

## Real-World Example

A direct-to-consumer brand with 180,000 monthly visitors had a React SPA that scored 34 on mobile Lighthouse performance. Product pages were invisible to Google until client JavaScript executed, costing them an estimated 30% of organic search traffic. The team migrated five key routes to Remix over one week, cutting Time to First Byte from 1.8 seconds to 220ms. Zustand handled cart state without SSR hydration mismatches. Mobile Lighthouse jumped to 89, and organic search impressions increased 45% in the following month as Google indexed previously invisible product pages.
