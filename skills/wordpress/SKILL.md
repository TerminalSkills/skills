---
name: wordpress
category: Web Development
tags: [cms, php, blog, ecommerce, plugins, themes, self-hosted]
version: 1.0.0
author: terminal-skills
---

# WordPress — The World's Most Popular CMS

You are an expert in WordPress, the open-source CMS powering 43% of the web. You help developers build websites, blogs, e-commerce stores, and web applications using WordPress block editor (Gutenberg), custom themes, plugins, REST API, WP-CLI, and headless WordPress — from simple blogs to complex multi-site enterprise platforms.

## Core Capabilities

### WP-CLI (Command Line)

```bash
# Install WordPress
wp core download
wp config create --dbname=mysite --dbuser=root --dbpass=secret
wp core install --url=mysite.local --title="My Site" --admin_user=admin --admin_email=admin@example.com

# Manage plugins
wp plugin install woocommerce --activate
wp plugin install advanced-custom-fields --activate
wp plugin list --status=active
wp plugin update --all

# Manage content
wp post create --post_title="Hello World" --post_status=publish --post_type=post
wp post list --post_type=page --format=json
wp post meta update 42 custom_field "value"

# Database
wp db export backup.sql
wp search-replace "http://old.com" "https://new.com" --dry-run
wp db optimize

# Users
wp user create editor editor@example.com --role=editor
wp user list --role=administrator
```

### REST API (Headless WordPress)

```typescript
// Next.js frontend with WordPress as headless CMS
const WP_API = process.env.WORDPRESS_API_URL;    // https://cms.example.com/wp-json/wp/v2

async function getPosts(page = 1, perPage = 10) {
  const res = await fetch(
    `${WP_API}/posts?page=${page}&per_page=${perPage}&_embed`,
    { next: { revalidate: 60 } },
  );
  const posts = await res.json();
  const total = parseInt(res.headers.get("X-WP-Total") || "0");
  return { posts, total };
}

async function getPostBySlug(slug: string) {
  const res = await fetch(`${WP_API}/posts?slug=${slug}&_embed`);
  const posts = await res.json();
  return posts[0] || null;
}

// Custom post types via REST API
async function getProducts() {
  const res = await fetch(`${WP_API}/products?_embed&per_page=50`);
  return res.json();
}

// ACF (Advanced Custom Fields) data
// Requires ACF to REST API plugin
async function getPageWithACF(slug: string) {
  const res = await fetch(`${WP_API}/pages?slug=${slug}&_fields=id,title,acf`);
  const pages = await res.json();
  return pages[0]?.acf;   // Custom fields as JSON
}
```

### Custom Theme (Block Theme)

```json
// theme.json — Block theme configuration
{
  "$schema": "https://schemas.wp.org/trunk/theme.json",
  "version": 2,
  "settings": {
    "color": {
      "palette": [
        { "slug": "primary", "color": "#6366f1", "name": "Primary" },
        { "slug": "secondary", "color": "#0f172a", "name": "Secondary" }
      ]
    },
    "typography": {
      "fontFamilies": [
        {
          "fontFamily": "Inter, sans-serif",
          "slug": "inter",
          "name": "Inter",
          "fontFace": [
            { "fontFamily": "Inter", "fontWeight": "400 700", "src": ["file:./assets/fonts/Inter.woff2"] }
          ]
        }
      ],
      "fontSizes": [
        { "slug": "small", "size": "0.875rem", "name": "Small" },
        { "slug": "medium", "size": "1rem", "name": "Medium" },
        { "slug": "large", "size": "1.5rem", "name": "Large" },
        { "slug": "x-large", "size": "2.5rem", "name": "Extra Large" }
      ]
    },
    "layout": { "contentSize": "720px", "wideSize": "1200px" }
  }
}
```

### WooCommerce Integration

```php
// Custom WooCommerce endpoint
add_action('rest_api_init', function() {
    register_rest_route('custom/v1', '/featured-products', [
        'methods' => 'GET',
        'callback' => function() {
            $products = wc_get_products([
                'featured' => true,
                'limit' => 12,
                'status' => 'publish',
            ]);
            return array_map(function($product) {
                return [
                    'id' => $product->get_id(),
                    'name' => $product->get_name(),
                    'price' => $product->get_price(),
                    'image' => wp_get_attachment_url($product->get_image_id()),
                    'permalink' => $product->get_permalink(),
                ];
            }, $products);
        },
        'permission_callback' => '__return_true',
    ]);
});
```

## Installation

```bash
# Docker
docker run -d --name wordpress -p 8080:80 \
  -e WORDPRESS_DB_HOST=db -e WORDPRESS_DB_PASSWORD=secret \
  -v wp_data:/var/www/html wordpress:latest

# Or via WP-CLI
wp core download && wp config create && wp core install
```

## Best Practices

1. **Block themes** — Use theme.json + HTML block templates; modern WordPress development, no PHP templates needed
2. **Headless for custom frontends** — Use WordPress REST API + Next.js/Nuxt for full control over frontend performance
3. **ACF for custom fields** — Advanced Custom Fields for structured content (hero sections, team bios, product specs)
4. **WP-CLI for automation** — Script installations, updates, content imports, and database operations
5. **Security** — Keep core/plugins updated, use strong passwords, install Wordfence, disable xmlrpc.php, limit login attempts
6. **Performance** — Use caching plugin (WP Super Cache, W3 Total), CDN (Cloudflare), image optimization (ShortPixel)
7. **Custom post types** — Register CPTs for structured content beyond posts/pages (products, events, testimonials)
8. **Multisite** — Use WordPress Multisite for managing multiple sites from one installation (agencies, networks)
