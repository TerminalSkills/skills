---
title: Build a Shopify Store with Custom Liquid Theme and Staff-Editable Sections
slug: build-shopify-store-with-custom-liquid-theme
description: Create a Shopify store with custom Liquid sections and blocks that staff can edit through the Online Store Editor — no developer needed for day-to-day content updates.
skills:
  - shopify
category: ecommerce
tags:
  - shopify
  - liquid
  - theme-development
  - ecommerce
  - no-code-editing
  - staff-managed
---

## The Problem

Dani runs a small home goods brand with 4 employees. She needs an online store — product catalog, cart, checkout, payments — but every time she wants to change a banner, rearrange the homepage, or add a seasonal promo section, she has to call a developer. The developer charges hourly, takes 2-3 days to respond, and sometimes breaks other things in the process. Dani wants her team to update the store themselves: swap images, change copy, add new sections, rearrange layouts — all through the Shopify admin, no code involved.

The solution isn't a page builder app (GemPages, Shogun) — those add monthly costs and performance overhead. Shopify's native Online Store Editor already lets staff drag sections and edit blocks. The trick is building the theme with the right section schemas so every editable part is exposed as a clean, labeled field in the editor.

## The Solution

Build a custom Shopify theme using Liquid templates with section schemas that expose every content element — headings, images, buttons, colors — as editor fields. Staff sees a visual editor with labeled inputs. Developers see clean, maintainable Liquid code. No apps, no monthly fees beyond Shopify itself.

## Step-by-Step Walkthrough

### Step 1: Set Up the Theme Structure

Initialize a Shopify theme with the standard directory structure. Every template is a JSON file that references sections, and every section is a Liquid file with a schema block.

```
shopify-theme/
├── config/
│   └── settings_schema.json    # Global theme settings (colors, fonts, logos)
├── layout/
│   └── theme.liquid            # Base HTML wrapper
├── templates/
│   ├── index.json              # Homepage — references sections by key
│   ├── product.json            # Product page layout
│   └── collection.json         # Collection page layout
├── sections/
│   ├── hero-banner.liquid      # Full-width hero with CTA
│   ├── featured-collection.liquid
│   ├── testimonials.liquid
│   ├── promo-grid.liquid       # Seasonal promo cards
│   └── newsletter.liquid
├── snippets/
│   ├── product-card.liquid     # Reusable product card
│   └── responsive-image.liquid # Optimized image rendering
└── assets/
    └── theme.css
```

The key insight: `templates/index.json` doesn't contain HTML — it's a list of section references that the editor can reorder:

```json
{
  "sections": {
    "hero": {
      "type": "hero-banner",
      "settings": {}
    },
    "featured": {
      "type": "featured-collection",
      "settings": {
        "collection": "best-sellers",
        "heading": "Our Best Sellers"
      }
    },
    "promos": {
      "type": "promo-grid",
      "settings": {}
    },
    "testimonials": {
      "type": "testimonials",
      "settings": {}
    },
    "newsletter": {
      "type": "newsletter",
      "settings": {}
    }
  },
  "order": ["hero", "featured", "promos", "testimonials", "newsletter"]
}
```

Staff can reorder these sections by dragging them in the editor. They can also add new instances of any section or remove ones they don't need.

### Step 2: Build Sections with Rich Schemas

The section schema is what makes the editor work. Every field you define in the schema becomes an input in the Online Store Editor. The more thoughtful the schema, the more power staff has without touching code.

Here's a hero banner section that staff can fully customize:

```liquid
{% comment %}
  sections/hero-banner.liquid
  Full-width hero with heading, subheading, CTA button, and background image.
  Staff can change every element through the Online Store Editor.
{% endcomment %}

<section
  class="hero-banner"
  style="
    background-image: url('{{ section.settings.background_image | image_url: width: 1920 }}');
    min-height: {{ section.settings.height }}px;
    color: {{ section.settings.text_color }};
  "
>
  <div class="hero-banner__overlay" style="background-color: {{ section.settings.overlay_color }}; opacity: {{ section.settings.overlay_opacity | divided_by: 100.0 }};">
  </div>

  <div class="hero-banner__content hero-banner__content--{{ section.settings.text_alignment }}">
    {% if section.settings.heading != blank %}
      <h1 class="hero-banner__heading">{{ section.settings.heading }}</h1>
    {% endif %}

    {% if section.settings.subheading != blank %}
      <p class="hero-banner__subheading">{{ section.settings.subheading }}</p>
    {% endif %}

    {% if section.settings.button_text != blank %}
      <a
        href="{{ section.settings.button_link }}"
        class="hero-banner__button hero-banner__button--{{ section.settings.button_style }}"
      >
        {{ section.settings.button_text }}
      </a>
    {% endif %}
  </div>
</section>

{% schema %}
{
  "name": "Hero Banner",
  "tag": "section",
  "class": "hero-banner-section",
  "settings": [
    {
      "type": "image_picker",
      "id": "background_image",
      "label": "Background Image",
      "info": "Recommended: 1920×800px. JPG or WebP for best performance."
    },
    {
      "type": "range",
      "id": "height",
      "label": "Banner Height (px)",
      "min": 300,
      "max": 800,
      "step": 50,
      "default": 500
    },
    {
      "type": "text",
      "id": "heading",
      "label": "Heading",
      "default": "Welcome to Our Store"
    },
    {
      "type": "textarea",
      "id": "subheading",
      "label": "Subheading",
      "default": "Discover handcrafted home goods made with care."
    },
    {
      "type": "text",
      "id": "button_text",
      "label": "Button Text",
      "default": "Shop Now"
    },
    {
      "type": "url",
      "id": "button_link",
      "label": "Button Link"
    },
    {
      "type": "select",
      "id": "button_style",
      "label": "Button Style",
      "options": [
        { "value": "primary", "label": "Primary (filled)" },
        { "value": "outline", "label": "Outline" },
        { "value": "minimal", "label": "Minimal (text only)" }
      ],
      "default": "primary"
    },
    {
      "type": "select",
      "id": "text_alignment",
      "label": "Text Alignment",
      "options": [
        { "value": "left", "label": "Left" },
        { "value": "center", "label": "Center" },
        { "value": "right", "label": "Right" }
      ],
      "default": "center"
    },
    {
      "type": "color",
      "id": "text_color",
      "label": "Text Color",
      "default": "#ffffff"
    },
    {
      "type": "color",
      "id": "overlay_color",
      "label": "Overlay Color",
      "default": "#000000"
    },
    {
      "type": "range",
      "id": "overlay_opacity",
      "label": "Overlay Opacity (%)",
      "min": 0,
      "max": 80,
      "step": 5,
      "default": 30
    }
  ],
  "presets": [
    {
      "name": "Hero Banner"
    }
  ]
}
{% endschema %}
```

In the editor, staff sees labeled fields: "Background Image" with a file picker, "Heading" with a text input, "Button Style" with a dropdown, "Overlay Opacity" with a slider. They don't see Liquid code — just a clean form.

### Step 3: Add Block-Based Sections for Repeatable Content

Some sections need repeatable items — testimonials, promo cards, feature lists. Shopify blocks let staff add, remove, and reorder items within a section.

```liquid
{% comment %}
  sections/promo-grid.liquid
  Grid of promotional cards. Staff adds/removes/reorders cards through blocks.
  Each block is one card with its own image, text, and link.
{% endcomment %}

<section class="promo-grid">
  {% if section.settings.heading != blank %}
    <h2 class="promo-grid__heading">{{ section.settings.heading }}</h2>
  {% endif %}

  <div class="promo-grid__container promo-grid__container--{{ section.settings.columns }}-cols">
    {% for block in section.blocks %}
      <div class="promo-grid__card" {{ block.shopify_attributes }}>
        {% if block.settings.image != blank %}
          <img
            src="{{ block.settings.image | image_url: width: 600 }}"
            alt="{{ block.settings.image.alt | default: block.settings.title }}"
            loading="lazy"
            width="600"
            height="400"
            class="promo-grid__image"
          >
        {% endif %}

        <div class="promo-grid__content">
          <h3 class="promo-grid__title">{{ block.settings.title }}</h3>
          <p class="promo-grid__text">{{ block.settings.description }}</p>

          {% if block.settings.link_text != blank %}
            <a href="{{ block.settings.link_url }}" class="promo-grid__link">
              {{ block.settings.link_text }} →
            </a>
          {% endif %}
        </div>
      </div>
    {% endfor %}
  </div>
</section>

{% schema %}
{
  "name": "Promo Grid",
  "settings": [
    {
      "type": "text",
      "id": "heading",
      "label": "Section Heading",
      "default": "Current Promotions"
    },
    {
      "type": "select",
      "id": "columns",
      "label": "Columns",
      "options": [
        { "value": "2", "label": "2 columns" },
        { "value": "3", "label": "3 columns" },
        { "value": "4", "label": "4 columns" }
      ],
      "default": "3"
    }
  ],
  "blocks": [
    {
      "type": "promo_card",
      "name": "Promo Card",
      "settings": [
        {
          "type": "image_picker",
          "id": "image",
          "label": "Card Image"
        },
        {
          "type": "text",
          "id": "title",
          "label": "Title",
          "default": "Spring Sale"
        },
        {
          "type": "textarea",
          "id": "description",
          "label": "Description",
          "default": "Up to 30% off selected items."
        },
        {
          "type": "text",
          "id": "link_text",
          "label": "Link Text",
          "default": "Shop Now"
        },
        {
          "type": "url",
          "id": "link_url",
          "label": "Link URL"
        }
      ]
    }
  ],
  "presets": [
    {
      "name": "Promo Grid",
      "blocks": [
        { "type": "promo_card" },
        { "type": "promo_card" },
        { "type": "promo_card" }
      ]
    }
  ]
}
{% endschema %}
```

Staff clicks "Add block" in the editor to create a new promo card, fills in the fields, drags it to reorder. Seasonal campaign? Add 3 promo cards, upload images, set links, publish. Remove them when the campaign ends. Zero developer involvement.

### Step 4: Global Theme Settings for Brand Consistency

Define brand-level settings that apply across all sections — colors, fonts, logo, social links. Staff changes the brand color once, and every section updates.

```json
[
  {
    "name": "Brand",
    "settings": [
      {
        "type": "image_picker",
        "id": "logo",
        "label": "Store Logo"
      },
      {
        "type": "color",
        "id": "color_primary",
        "label": "Primary Brand Color",
        "default": "#2563EB"
      },
      {
        "type": "color",
        "id": "color_secondary",
        "label": "Secondary Color",
        "default": "#1E293B"
      },
      {
        "type": "color",
        "id": "color_accent",
        "label": "Accent Color",
        "default": "#F59E0B"
      },
      {
        "type": "color",
        "id": "color_background",
        "label": "Background Color",
        "default": "#FFFFFF"
      }
    ]
  },
  {
    "name": "Typography",
    "settings": [
      {
        "type": "font_picker",
        "id": "font_heading",
        "label": "Heading Font",
        "default": "assistant_n4"
      },
      {
        "type": "font_picker",
        "id": "font_body",
        "label": "Body Font",
        "default": "work_sans_n4"
      }
    ]
  },
  {
    "name": "Social Media",
    "settings": [
      { "type": "text", "id": "social_instagram", "label": "Instagram URL" },
      { "type": "text", "id": "social_facebook", "label": "Facebook URL" },
      { "type": "text", "id": "social_tiktok", "label": "TikTok URL" }
    ]
  }
]
```

Sections reference these with `settings.color_primary`, `settings.font_heading`, etc. One place to maintain the brand, consistent everywhere.

### Step 5: Deploy and Test with Shopify CLI

```bash
# Install Shopify CLI
npm install -g @shopify/cli @shopify/theme

# Start local development with hot reload
shopify theme dev --store=your-store.myshopify.com

# Preview changes at https://127.0.0.1:9292
# Every save updates instantly in the browser

# When ready, push to the live theme
shopify theme push --live
```

Before going live, test in the Online Store Editor:
1. Open Shopify Admin → Online Store → Themes → Customize
2. Verify every section shows the right fields with clear labels
3. Have a non-technical team member try editing — if they ask "what does this field do?", the label needs improvement
4. Test on mobile — the editor works on tablets too, staff can update from anywhere

## The Outcome

Dani's team manages the store entirely through the Shopify admin. Adding a seasonal promotion: open the editor, add a promo card block, upload an image, type the copy, set the link, publish — 3 minutes, no developer. Changing the hero banner for a holiday sale: swap the image, update the heading, adjust the button link — done. Rearranging the homepage: drag sections up or down in the editor.

The theme has zero app dependencies. No GemPages subscription, no page builder overhead. Just native Liquid sections with well-designed schemas. The developer cost drops to zero for content updates — Dani only needs a developer when she wants entirely new section types, which happens maybe twice a year.
