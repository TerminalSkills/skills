---
name: wordpress
description: >-
  WordPress is an open-source CMS for websites, blogs and online stores,
  extended with themes, plugins and a REST API. Use when installing or
  scripting WordPress with WP-CLI, building a block theme with theme.json,
  registering custom post types or REST routes, running WordPress headless
  behind a Next.js frontend, or adding WooCommerce endpoints.
license: Apache-2.0
compatibility: "WordPress 6.6+ (tested on 7.1.3, PHP 8.3, MariaDB 11, WP-CLI 2.12); Docker optional"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/WordPress/WordPress
  tags: "wordpress, cms, php, rest-api, wp-cli"
---

# WordPress

## Overview

WordPress is a PHP/MySQL (or MariaDB) CMS. Content is stored as posts of a type (post, page, or a custom post type), shaped by a theme and extended by plugins. Modern themes are **block themes**: HTML templates built from blocks plus a `theme.json` file for design settings. The REST API lives at `/wp-json/wp/v2/` and powers both the editor and headless frontends. `wp` (WP-CLI) scripts installs, content, users, plugins and database tasks. Check the current version with `wp core version` and the plugin pages before pinning anything.

## Instructions

### Run a local site

```bash
docker network create harbor-net
docker run -d --name harbor-db --network harbor-net \
  -e MARIADB_ROOT_PASSWORD="$DB_ROOT_PASSWORD" -e MARIADB_DATABASE=wordpress \
  -e MARIADB_USER=wp -e MARIADB_PASSWORD="$DB_PASSWORD" mariadb:11
docker run -d --name harbor-wp --network harbor-net -p 127.0.0.1:8080:80 \
  -e WORDPRESS_DB_HOST=harbor-db -e WORDPRESS_DB_USER=wp \
  -e WORDPRESS_DB_PASSWORD="$DB_PASSWORD" -e WORDPRESS_DB_NAME=wordpress \
  -v harbor-html:/var/www/html wordpress:apache
```

`WORDPRESS_DB_PASSWORD` must be set for the image to write `wp-config.php`. Publish on `127.0.0.1` only unless the site is meant to be public.

### WP-CLI

Run it as the web user (uid 33 in the official image), either on the host or with the `wordpress:cli` image sharing the volume:

```bash
alias wp='docker run --rm --network harbor-net --volumes-from harbor-wp --user 33:33 \
  -e WORDPRESS_DB_HOST=harbor-db -e WORDPRESS_DB_USER=wp -e WORDPRESS_DB_PASSWORD="$DB_PASSWORD" \
  -e WORDPRESS_DB_NAME=wordpress wordpress:cli wp'

wp core install --url=http://127.0.0.1:8080 --title="Harbor Coffee" \
  --admin_user=siteadmin --admin_password="$WP_ADMIN_PASSWORD" --admin_email=admin@harborcoffee.test --skip-email
wp plugin install advanced-custom-fields --activate
wp plugin list --status=active --format=csv
wp plugin update --all
wp post create --post_title="Opening hours update" --post_status=publish --porcelain   # prints the new ID
wp post meta update 4 subtitle "Now open Sundays"
wp user create editor1 editor1@harborcoffee.test --role=editor --porcelain
wp search-replace "http://127.0.0.1:8080" "https://harborcoffee.test" --dry-run
wp db export backup.sql
```

On a normal install (not Docker) use `wp core download`, `wp config create --dbname=... --dbuser=... --prompt=dbpass` and `wp core install`. Keep passwords out of the command line: use `--prompt`, environment variables, or the config file. Always run `search-replace` with `--dry-run` first and back up the database before the real run.

### Block theme

A block theme needs `style.css` (header comment: `Theme Name`, `Version`, `Requires at least`), `theme.json`, and `templates/index.html`; template parts go in `parts/`. Use `"version": 3` for `theme.json` (WordPress 6.6+). Verified to activate as a block theme (`wp_is_block_theme()` returns true) and apply the palette and layout:

```json
{
  "$schema": "https://schemas.wp.org/trunk/theme.json",
  "version": 3,
  "settings": {
    "appearanceTools": true,
    "color": {
      "palette": [
        { "slug": "primary", "color": "#6366f1", "name": "Primary" },
        { "slug": "ink", "color": "#0f172a", "name": "Ink" }
      ]
    },
    "typography": {
      "fontFamilies": [
        {
          "fontFamily": "Inter, sans-serif", "slug": "inter", "name": "Inter",
          "fontFace": [
            { "fontFamily": "Inter", "fontWeight": "400 700", "fontStyle": "normal", "fontDisplay": "swap", "src": ["file:./assets/fonts/Inter.woff2"] }
          ]
        }
      ],
      "fluid": true
    },
    "layout": { "contentSize": "720px", "wideSize": "1200px" }
  },
  "styles": {
    "color": { "background": "#ffffff", "text": "var(--wp--preset--color--ink)" },
    "elements": { "link": { "color": { "text": "var(--wp--preset--color--primary)" } } }
  }
}
```

`templates/index.html` is block markup, for example a header part plus a query loop:

```html
<!-- wp:template-part {"slug":"header"} /-->
<!-- wp:group {"tagName":"main","layout":{"type":"constrained"}} -->
<main class="wp-block-group"><!-- wp:query {"queryId":1,"query":{"perPage":10,"postType":"post"}} -->
<div class="wp-block-query"><!-- wp:post-template -->
<!-- wp:post-title {"isLink":true} /--><!-- wp:post-excerpt /-->
<!-- /wp:post-template --></div>
<!-- /wp:query --></main>
<!-- /wp:group -->
```

Copy the folder to `wp-content/themes/harbor` and run `wp theme activate harbor`. Palette slugs become CSS variables such as `--wp--preset--color--primary`.

### REST API and headless use

The REST API is public for published content. Pagination totals come back in the `X-WP-Total` and `X-WP-TotalPages` headers. A custom post type appears at `/wp-json/wp/v2/products` (the `rest_base` you set) only with `'show_in_rest' => true`. ACF (6.x) exposes fields in an `acf` property natively when the field group and field have "Show in REST API" on (`'show_in_rest' => 1` in code); the older "ACF to REST API" plugin is not needed. Without pretty permalinks use `/index.php?rest_route=/wp/v2/posts`.

```typescript
const WP_API = process.env.WORDPRESS_API_URL; // https://cms.harborcoffee.test/wp-json/wp/v2

export async function getPosts(page = 1, perPage = 10) {
  const res = await fetch(`${WP_API}/posts?page=${page}&per_page=${perPage}&_embed`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`WordPress returned ${res.status}`);
  return { posts: await res.json(), total: Number(res.headers.get("X-WP-Total") ?? 0) };
}

export async function getPostBySlug(slug: string) {
  const res = await fetch(`${WP_API}/posts?slug=${encodeURIComponent(slug)}&_embed`);
  const posts = await res.json();
  return posts[0] ?? null;
}
```

For writes from a frontend or script, create an Application Password (`wp user application-password create siteadmin nextjs-frontend --porcelain`) and send it with HTTP Basic auth. WordPress only enables Application Passwords over HTTPS (or when `WP_ENVIRONMENT_TYPE` is `local`), so over plain HTTP the request is rejected with 401.

### Custom post types and routes

Put these in a plugin or a `wp-content/mu-plugins/` file, not in a theme. Verified against the REST API; the `acf` property returned `{"roast":"light"}`:

```php
<?php
add_action('init', function () {
    register_post_type('product_page', [
        'label' => 'Product pages', 'public' => true,
        'show_in_rest' => true, 'rest_base' => 'products',
        'supports' => ['title', 'editor', 'custom-fields'],
    ]);
});

add_action('rest_api_init', function () {
    register_rest_route('harbor/v1', '/latest', [
        'methods' => 'GET',
        'callback' => fn () => array_map(
            fn ($p) => ['id' => $p->ID, 'title' => get_the_title($p)],
            get_posts(['numberposts' => 3])
        ),
        'permission_callback' => '__return_true', // required; omit it and WordPress logs a notice
    ]);
});
```

### WooCommerce route (not run here)

```php
add_action('rest_api_init', function () {
    register_rest_route('harbor/v1', '/featured-products', [
        'methods' => 'GET',
        'callback' => function () {
            $products = wc_get_products(['featured' => true, 'limit' => 12, 'status' => 'publish']);
            return array_map(fn ($p) => [
                'id' => $p->get_id(), 'name' => $p->get_name(), 'price' => $p->get_price(),
                'image' => wp_get_attachment_url($p->get_image_id()), 'permalink' => $p->get_permalink(),
            ], $products);
        },
        'permission_callback' => '__return_true',
    ]);
});
```

WooCommerce also ships its own REST API under `/wp-json/wc/v3/` (keys required) and a Store API under `/wp-json/wc/store/v1/` for storefronts.

## Examples

### Example 1: Stand up a site and publish from the shell

**User request:** "Spin up a local WordPress for Harbor Coffee, install ACF and publish a first post."

Run the Docker commands above, then the `wp core install`, `wp plugin install advanced-custom-fields --activate` and `wp post create` lines. `wp post create ... --porcelain` prints `4`; `curl "http://127.0.0.1:8080/index.php?rest_route=/wp/v2/posts&_fields=id,slug"` then returns `[{"id":4,"slug":"opening-hours-update"}, ...]` with `X-WP-Total: 2`.

### Example 2: Move a staging site to its real domain

**User request:** "Change every staging URL in the database to https://harborcoffee.test."

```bash
wp db export before-move.sql
wp search-replace "http://127.0.0.1:8080" "https://harborcoffee.test" --dry-run
wp search-replace "http://127.0.0.1:8080" "https://harborcoffee.test" --skip-columns=guid
wp cache flush
```

The dry run reported "9 replacements to be made" on a fresh install. `search-replace` handles serialized PHP data safely; never use a plain SQL `REPLACE()` on `wp_options`.

## Guidelines

- Keep core, themes and plugins updated (`wp core update`, `wp plugin update --all`); most compromises come from outdated plugins. Install only plugins you need, from the official directory or a vendor you trust.
- Set `define('DISALLOW_FILE_EDIT', true);` in `wp-config.php` so the dashboard cannot edit code, and keep `wp-config.php` and its secret keys out of version control.
- Every `register_rest_route` needs a real `permission_callback`; use `__return_true` only for public data and check capabilities (`current_user_can`) for anything private.
- Escape output (`esc_html`, `esc_attr`, `esc_url`) and sanitize input; use `$wpdb->prepare()` for SQL.
- Do not store themes' business logic in `functions.php`; put it in a plugin so a theme switch does not lose it.
- Headless setups: cache fetches (`revalidate`), request only needed fields with `_fields=`, and keep the admin on a separate hostname behind a firewall or login protection.
- Caching, a CDN and image optimisation matter more than which caching plugin you pick; test with the plugin off before blaming WordPress.
