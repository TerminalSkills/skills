---
name: schema-markup
description: When the user wants to add, fix, or optimize schema markup and structured data on their site. Also use when the user mentions "schema markup," "structured data," "JSON-LD," "rich snippets," "schema.org," "FAQ schema," "product schema," "review schema," or "breadcrumb schema." For broader SEO issues, see seo-audit.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: marketing
  tags:
    - seo
    - structured-data
    - rich-snippets
---

# Schema Markup

## Overview

You are an expert in structured data and schema markup. Your goal is to implement schema.org markup that helps search engines understand content and enables rich results in search.

**Check for product marketing context first:**
If `.claude/product-marketing-context.md` exists, read it before asking questions. Use that context and only ask for information not already covered or specific to this task.

## Instructions

### Initial Assessment

Before implementing schema, understand:

1. **Page Type** - What kind of page? What's the primary content? What rich results are possible?
2. **Current State** - Any existing schema? Errors in implementation? Which rich results already appearing?
3. **Goals** - Which rich results are you targeting? What's the business value?

### Core Principles

1. **Accuracy First** - Schema must accurately represent page content. Don't markup content that doesn't exist. Keep updated when content changes.
2. **Use JSON-LD** - Google recommends JSON-LD format. Easier to implement and maintain. Place in `<head>` or end of `<body>`.
3. **Follow Google's Guidelines** - Only use markup Google supports. Avoid spam tactics. Review eligibility requirements.
4. **Validate Everything** - Test before deploying. Monitor Search Console. Fix errors promptly.

### Common Schema Types

| Type | Use For | Required Properties |
|------|---------|-------------------|
| Organization | Company homepage/about | name, url |
| WebSite | Homepage (search box) | name, url |
| Article | Blog posts, news | headline, image, datePublished, author |
| Product | Product pages | name, image, offers |
| SoftwareApplication | SaaS/app pages | name, offers |
| FAQPage | FAQ content | mainEntity (Q&A array) |
| HowTo | Tutorials | name, step |
| BreadcrumbList | Any page with breadcrumbs | itemListElement |
| LocalBusiness | Local business pages | name, address |
| Event | Events, webinars | name, startDate, location |

**For complete JSON-LD examples**: See [references/schema-examples.md](references/schema-examples.md)

### Quick Reference for Key Types

**Organization:** Required: name, url. Recommended: logo, sameAs (social profiles), contactPoint.

**Article/BlogPosting:** Required: headline, image, datePublished, author. Recommended: dateModified, publisher, description.

**Product:** Required: name, image, offers (price + availability). Recommended: sku, brand, aggregateRating, review.

**FAQPage:** Required: mainEntity (array of Question/Answer pairs).

**BreadcrumbList:** Required: itemListElement (array with position, name, item).

### Combining Multiple Schema Types

Use `@graph` to combine multiple schema types on one page:

```json
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", ... },
    { "@type": "WebSite", ... },
    { "@type": "BreadcrumbList", ... }
  ]
}
```

### Validation and Testing

**Tools:**
- Google Rich Results Test: https://search.google.com/test/rich-results
- Schema.org Validator: https://validator.schema.org/
- Search Console: Enhancements reports

**Common Errors:** Missing required properties, invalid values (dates must be ISO 8601, URLs fully qualified), mismatch between schema and visible page content.

### Implementation by Stack

**Static Sites:** Add JSON-LD directly in HTML template. Use includes/partials for reusable schema.

**Dynamic Sites (React, Next.js):** Component that renders schema, server-side rendered for SEO, serialize data to JSON-LD.

**CMS / WordPress:** Plugins (Yoast, Rank Math, Schema Pro), theme modifications, custom fields to structured data.

### Output Format

Provide complete JSON-LD code blocks ready to paste, plus a testing checklist: validates in Rich Results Test, no errors or warnings, matches page content, all required properties included.

## Examples

### Example 1: Product Schema for a Shopify Store Product Page

**User prompt:** "Add schema markup to our product page for the 'CloudWalk Pro Running Shoe' on our Shopify store. It's $149.99, in stock, and has 4.6 stars from 238 reviews."

The agent will generate a complete Product JSON-LD block including:
- Product type with name, description, image, sku, brand
- Offers with price ($149.99), priceCurrency (USD), availability (InStock), url
- AggregateRating with ratingValue (4.6), reviewCount (238)
- BreadcrumbList for the category path (Home > Running > CloudWalk Pro Running Shoe)
- Implementation instructions specific to Shopify's theme.liquid or a schema app
- Validation steps using Google Rich Results Test

### Example 2: FAQ Schema for a SaaS Pricing Page

**User prompt:** "We have 6 FAQ questions on our pricing page at dashmetrics.com/pricing. Add FAQ schema so they show up as rich results in Google."

The agent will generate a complete FAQPage JSON-LD block:
- FAQPage type with mainEntity array containing all 6 Question/Answer pairs
- Each question with acceptedAnswer containing the full answer text
- Combined with BreadcrumbList schema for the pricing page path using @graph
- Reminder that FAQ content in schema must exactly match the visible FAQ content on the page
- Implementation guidance for their stack (Next.js component, WordPress plugin, or raw HTML)
- Note about monitoring Search Console Enhancements report to verify rich results appear within 1-2 weeks

## Guidelines

- Always check `.claude/product-marketing-context.md` before asking discovery questions
- Always use JSON-LD format since Google explicitly recommends it over Microdata or RDFa
- Never add schema markup for content that does not exist on the visible page since Google penalizes mismatches
- Always include all required properties for each schema type before adding recommended properties
- Validate every schema implementation using the Google Rich Results Test before deploying to production
- When combining multiple schema types on a page, use the @graph pattern to keep them organized in a single script block
- Provide copy-paste-ready JSON-LD code blocks, not abstract descriptions of what to implement
- For dynamic sites, recommend server-side rendering of schema since client-rendered JSON-LD may not be reliably crawled
- Monitor Search Console Enhancements reports after deployment to catch validation errors early
