---
title: Build a WordPress Plugin
slug: build-wordpress-plugin
description: Build a WordPress plugin with a custom post type, meta box, REST API endpoint, admin settings page and shortcode, test it on a real WordPress, and publish it to the WordPress.org plugin directory.
skills:
  - wordpress
  - mysql
category: development
tags:
  - wordpress
  - plugin
  - php
  - cms
  - rest-api
---

# Build a WordPress Plugin

## The Problem

Luisa builds websites for service businesses. Every client needs a "Testimonials" system: a place to manage customer reviews in the admin, display them on the frontend, and expose them via API for a headless front. She wants one reusable plugin for every client site: a custom post type, an admin settings page, a shortcode, and a read-only REST route. The code below was activated and exercised on WordPress 7.1.4 with PHP 8.3 (it needs WordPress 6.6+ and PHP 8.0+), and Plugin Check reported no errors.

## Step 1: Test Site, Plugin Header and Structure

Run a throwaway site to check every step. The **wordpress** skill has the full Docker and WP-CLI setup (database container, `wordpress:apache` bound to `127.0.0.1`, `wordpress:cli` for `wp`); then copy the folder to `wp-content/plugins/` and run `wp plugin activate stellar-testimonials`.

`stellar-testimonials.php` holds the header, loads the classes and boots them. The activation hook registers the post type before flushing rewrite rules, so `/testimonials/` works immediately:

```php
<?php
/**
 * Plugin Name: Stellar Testimonials
 * Description: Manage and display customer testimonials with ratings, schema markup, and REST API support.
 * Version:     1.0.0
 * License:     GPL-2.0-or-later
 * Text Domain: stellar-testimonials
 * Requires at least: 6.6
 * Requires PHP:      8.0
 */
if ( ! defined( 'ABSPATH' ) ) {
    exit; // Prevent direct file access
}
define( 'STELLAR_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
foreach ( [ 'PostType', 'RestApi', 'AdminSettings', 'Shortcode' ] as $stellar_class ) {
    require_once STELLAR_PLUGIN_DIR . "includes/$stellar_class.php";
}
// Rewrite rules must know the post type before they are flushed
register_activation_hook( __FILE__, function () {
    $types = new Stellar\PostType();
    $types->register_post_type();
    flush_rewrite_rules();
} );
register_deactivation_hook( __FILE__, 'flush_rewrite_rules' );
add_action( 'plugins_loaded', function () {
    ( new Stellar\PostType() )->register();
    ( new Stellar\RestApi() )->register();
    ( new Stellar\AdminSettings() )->register();
    ( new Stellar\Shortcode() )->register();
} );
```

## Step 2: Custom Post Type and Meta Box

```php
<?php
// includes/PostType.php
namespace Stellar;
class PostType {
    public function register(): void {
        add_action( 'init', [ $this, 'register_post_type' ] );
        add_action( 'add_meta_boxes', [ $this, 'add_meta_boxes' ] );
        add_action( 'save_post_stellar_review', [ $this, 'save_meta' ] );
    }
    public function register_post_type(): void {
        register_post_type( 'stellar_review', [
            'label'        => __( 'Testimonials', 'stellar-testimonials' ),
            'public'       => true,
            'show_in_rest' => true,
            'supports'     => [ 'title', 'editor', 'thumbnail' ],
            'menu_icon'    => 'dashicons-format-quote',
            'has_archive'  => true,
            'rewrite'      => [ 'slug' => 'testimonials' ],
        ] );
    }
    public function add_meta_boxes(): void {
        add_meta_box( 'stellar_details', __( 'Review Details', 'stellar-testimonials' ),
            [ $this, 'render_meta_box' ], 'stellar_review', 'side', 'high' );
    }
    public function render_meta_box( \WP_Post $post ): void {
        wp_nonce_field( 'stellar_save_meta', 'stellar_nonce' );
        $rating   = get_post_meta( $post->ID, '_stellar_rating', true ) ?: '5';
        $company  = get_post_meta( $post->ID, '_stellar_company', true );
        $verified = get_post_meta( $post->ID, '_stellar_verified', true );
        ?>
        <p><label><?php esc_html_e( 'Rating (1-5)', 'stellar-testimonials' ); ?>
            <input type="number" name="stellar_rating" min="1" max="5" value="<?php echo esc_attr( $rating ); ?>" class="widefat" /></label></p>
        <p><label><?php esc_html_e( 'Company', 'stellar-testimonials' ); ?>
            <input type="text" name="stellar_company" value="<?php echo esc_attr( $company ); ?>" class="widefat" /></label></p>
        <p><label><input type="checkbox" name="stellar_verified" value="1" <?php checked( $verified, '1' ); ?> />
            <?php esc_html_e( 'Verified purchase', 'stellar-testimonials' ); ?></label></p>
        <?php
    }
    public function save_meta( int $post_id ): void {
        $nonce = isset( $_POST['stellar_nonce'] ) ? sanitize_text_field( wp_unslash( $_POST['stellar_nonce'] ) ) : '';
        if ( ! wp_verify_nonce( $nonce, 'stellar_save_meta' ) ) return;
        if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) return;
        if ( ! current_user_can( 'edit_post', $post_id ) ) return;
        $rating = isset( $_POST['stellar_rating'] ) ? absint( $_POST['stellar_rating'] ) : 5;
        update_post_meta( $post_id, '_stellar_rating', max( 1, min( 5, $rating ) ) );
        update_post_meta( $post_id, '_stellar_company',
            sanitize_text_field( wp_unslash( $_POST['stellar_company'] ?? '' ) ) );
        update_post_meta( $post_id, '_stellar_verified', isset( $_POST['stellar_verified'] ) ? '1' : '0' );
    }
}
```

## Step 3: REST API Endpoint

The route is public and read-only, so `permission_callback` is `__return_true`. WordPress rejects out-of-range arguments from the declared `minimum` and `maximum` (`per_page=999` returns a 400). The rating filter needs `'type' => 'NUMERIC'`, otherwise MySQL compares the stored values as text. Single items are already served at `/wp/v2/stellar_review/<id>` because of `show_in_rest`.

```php
<?php
// includes/RestApi.php
namespace Stellar;
class RestApi {
    public function register(): void {
        add_action( 'rest_api_init', [ $this, 'register_routes' ] );
    }
    public function register_routes(): void {
        register_rest_route( 'stellar/v1', '/testimonials', [
            'methods'             => \WP_REST_Server::READABLE,
            'callback'            => [ $this, 'get_testimonials' ],
            'permission_callback' => '__return_true', // public, read-only data
            'args'                => [
                'per_page' => [ 'type' => 'integer', 'default' => 10, 'minimum' => 1, 'maximum' => 50 ],
                'rating'   => [ 'type' => 'integer', 'minimum' => 1, 'maximum' => 5 ],
            ],
        ] );
    }
    public function get_testimonials( \WP_REST_Request $request ): \WP_REST_Response {
        $args = [
            'post_type'      => 'stellar_review',
            'post_status'    => 'publish',
            'posts_per_page' => $request['per_page'],
        ];
        if ( $request['rating'] ) { // rating >= N; NUMERIC so "10" is not compared as text
            $args['meta_query'] = [ [ 'key' => '_stellar_rating', 'value' => $request['rating'],
                                      'compare' => '>=', 'type' => 'NUMERIC' ] ];
        }
        return new \WP_REST_Response( array_map( [ $this, 'format' ], get_posts( $args ) ) );
    }
    private function format( \WP_Post $post ): array {
        return [
            'id'       => $post->ID,
            'title'    => get_the_title( $post ),
            'content'  => wp_strip_all_tags( $post->post_content ),
            'rating'   => (int) get_post_meta( $post->ID, '_stellar_rating', true ),
            'company'  => get_post_meta( $post->ID, '_stellar_company', true ),
            'verified' => get_post_meta( $post->ID, '_stellar_verified', true ) === '1',
            'date'     => $post->post_date_gmt,
            'avatar'   => get_the_post_thumbnail_url( $post->ID, 'thumbnail' ) ?: null,
        ];
    }
}
```

Example: `curl "http://127.0.0.1:8080/index.php?rest_route=/stellar/v1/testimonials&rating=4&per_page=1"` returns a JSON list of `{id, title, content, rating, company, verified, date, avatar}`.

## Step 4: Admin Settings Page

```php
<?php
// includes/AdminSettings.php
namespace Stellar;
class AdminSettings {
    private const KEY = 'stellar_settings';
    private const DEFAULTS = [ 'columns' => 3, 'show_rating' => '1', 'schema_markup' => '1' ];
    public function register(): void {
        add_action( 'admin_menu', fn() => add_options_page( 'Stellar Testimonials', 'Stellar Testimonials',
            'manage_options', 'stellar-testimonials', [ $this, 'render_page' ] ) );
        add_action( 'admin_init', [ $this, 'register_settings' ] );
    }
    public function register_settings(): void {
        register_setting( 'stellar_options', self::KEY, [ 'sanitize_callback' => [ $this, 'sanitize' ] ] );
        add_settings_section( 'stellar_display', __( 'Display', 'stellar-testimonials' ), '__return_false', 'stellar-testimonials' );
        foreach ( [ 'columns' => __( 'Columns per row', 'stellar-testimonials' ),
                    'show_rating' => __( 'Show star rating', 'stellar-testimonials' ),
                    'schema_markup' => __( 'Output schema.org markup', 'stellar-testimonials' ) ] as $key => $label ) {
            add_settings_field( $key, $label, [ $this, 'render_field' ], 'stellar-testimonials', 'stellar_display', [ 'key' => $key ] );
        }
    }
    public function render_field( array $args ): void {
        $key  = $args['key'];
        $name = self::KEY . '[' . $key . ']';
        $val  = self::get()[ $key ];
        if ( $key === 'columns' ) {
            printf( '<input type="number" min="1" max="6" name="%s" value="%d" />', esc_attr( $name ), (int) $val );
        } else {
            printf( '<input type="checkbox" name="%s" value="1" %s />', esc_attr( $name ), checked( $val, '1', false ) );
        }
    }
    public function render_page(): void {
        if ( ! current_user_can( 'manage_options' ) ) return;
        echo '<div class="wrap"><h1>Stellar Testimonials</h1><form method="post" action="options.php">';
        settings_fields( 'stellar_options' );
        do_settings_sections( 'stellar-testimonials' );
        submit_button();
        echo '</form></div>';
    }
    public function sanitize( $input ): array {
        $input = is_array( $input ) ? $input : [];
        return [ 'columns'       => max( 1, min( 6, absint( $input['columns'] ?? 3 ) ) ),
                 'show_rating'   => empty( $input['show_rating'] ) ? '0' : '1',
                 'schema_markup' => empty( $input['schema_markup'] ) ? '0' : '1' ];
    }
    public static function get(): array {
        return wp_parse_args( get_option( self::KEY, [] ), self::DEFAULTS );
    }
}
```

## Step 5: Shortcode

`[stellar_testimonials columns="3" limit="6"]` renders a grid and, when the setting is on, a JSON-LD block. Attributes are clamped and output is escaped; `JSON_HEX_TAG` stops a testimonial containing `</script>` from breaking out of the JSON-LD tag, and the inline CSS is added only when the shortcode renders.

```php
<?php
// includes/Shortcode.php
// [stellar_testimonials columns="3" limit="6"]
namespace Stellar;
class Shortcode {
    public function register(): void {
        add_shortcode( 'stellar_testimonials', [ $this, 'render' ] );
    }
    public function render( $atts ): string {
        $opts = AdminSettings::get();
        $atts = shortcode_atts( [ 'columns' => $opts['columns'], 'limit' => 6 ], $atts, 'stellar_testimonials' );
        $query = [ 'post_type' => 'stellar_review', 'post_status' => 'publish',
                   'posts_per_page' => max( 1, min( 50, absint( $atts['limit'] ) ) ) ];
        $posts = get_posts( $query );
        if ( ! $posts ) return '';
        wp_register_style( 'stellar-frontend', false, [], '1.0.0' );
        wp_enqueue_style( 'stellar-frontend' );
        wp_add_inline_style( 'stellar-frontend', '.stellar-grid{display:grid;gap:1rem;grid-template-columns:repeat(var(--stellar-cols,3),1fr)}' );
        $html = sprintf( '<div class="stellar-grid" style="--stellar-cols:%d">', max( 1, min( 6, absint( $atts['columns'] ) ) ) );
        $ld   = [];
        foreach ( $posts as $post ) {
            $rating  = max( 0, min( 5, (int) get_post_meta( $post->ID, '_stellar_rating', true ) ) );
            $company = get_post_meta( $post->ID, '_stellar_company', true );
            $html   .= '<blockquote class="stellar-card">' . wp_kses_post( wpautop( $post->post_content ) )
                     . '<footer>' . esc_html( get_the_title( $post ) ) . ( $company ? ', ' . esc_html( $company ) : '' )
                     . ( $opts['show_rating'] === '1' ? ' <span aria-label="' . esc_attr( $rating ) . ' / 5">' . str_repeat( '★', $rating ) . '</span>' : '' )
                     . '</footer></blockquote>';
            $ld[] = [ '@type' => 'Review', 'reviewBody' => wp_strip_all_tags( $post->post_content ),
                      'author' => [ '@type' => 'Person', 'name' => get_the_title( $post ) ],
                      'reviewRating' => [ '@type' => 'Rating', 'ratingValue' => $rating, 'bestRating' => 5 ] ];
        }
        $html .= '</div>';
        if ( $opts['schema_markup'] === '1' ) {
            // JSON_HEX_TAG stops a testimonial containing "</script>" from closing the tag
            $html .= '<script type="application/ld+json">' . wp_json_encode( [ '@context' => 'https://schema.org', '@graph' => $ld ], JSON_HEX_TAG | JSON_UNESCAPED_UNICODE ) . '</script>';
        }
        return $html;
    }
}
```

## Step 6: Check the Data in the Database

WordPress stores each meta box field as a row in `wp_postmeta` (MySQL or MariaDB). The **mysql** skill covers the SQL; `wp db query "SELECT post_id, meta_key, meta_value FROM wp_postmeta WHERE meta_key LIKE '\_stellar\_%' ORDER BY post_id"` confirms that the meta box saved sanitized values.

Never build SQL by hand in the plugin: use `WP_Query` and `get_posts()`, or `$wpdb->prepare()`. Before submitting, run Plugin Check (`wp plugin install plugin-check --activate`, then `wp plugin check stellar-testimonials`); it only warned about the `meta_query` being a possible slow query.

## Step 7: Publish to WordPress.org

1. Add a `readme.txt` with `Stable tag` (matching the header version), `Requires at least`, `Tested up to`, `Requires PHP`, license and changelog; see [How your readme.txt works](https://developer.wordpress.org/plugins/wordpress-org/how-your-readme-txt-works/).
2. Zip the plugin folder and submit it at https://wordpress.org/plugins/developers/add/. The plugin team reviews it before your SVN repository is created.
3. After approval, commit to SVN ([guide](https://developer.wordpress.org/plugins/wordpress-org/how-to-use-subversion/)):

```bash
svn co https://plugins.svn.wordpress.org/<your-plugin-slug> svn-stellar
rsync -a stellar-testimonials/ svn-stellar/trunk/
cd svn-stellar && svn add --force trunk && svn ci -m "Initial release 1.0.0"
svn cp trunk tags/1.0.0 && svn ci -m "Tagging 1.0.0"
```

## Results

Luisa now has one plugin for every client site. Testimonials are edited in the admin, embedded with one shortcode, and read by a headless Next.js frontend from `/wp-json/stellar/v1/testimonials`. Column count, ratings and schema markup are settings, so a client change never touches PHP.

## Related Skills

- [wordpress](../skills/wordpress/) — local test site, WP-CLI, custom post types and REST routes.
- [mysql](../skills/mysql/) — inspecting the `wp_postmeta` rows the meta box writes, and keeping queries safe.
