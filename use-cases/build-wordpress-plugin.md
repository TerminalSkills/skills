---
title: Build a WordPress Plugin
slug: build-wordpress-plugin
description: Build a WordPress plugin with custom post types, meta boxes, REST API endpoints, admin settings page, and front-end scripts. Package and deploy to the WordPress.org plugin directory.
skills:
  - php
  - wordpress
  - javascript
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

Luisa builds websites for service businesses. Every client needs a "Testimonials" system: a place to manage customer reviews in the admin, display them on the frontend, and expose them via API for a headless front. She wants a reusable plugin she can install across client sites — with a custom post type for testimonials, an admin settings page, a shortcode, and a block for the block editor.

## Step 1: Plugin Header and Structure

```php
<?php
/**
 * Plugin Name: Stellar Testimonials
 * Plugin URI:  https://example.com/stellar-testimonials
 * Description: Manage and display customer testimonials with ratings, schema markup, and REST API support.
 * Version:     1.0.0
 * Author:      Luisa Chen
 * Author URI:  https://luisachen.dev
 * License:     GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: stellar-testimonials
 * Domain Path: /languages
 * Requires at least: 6.0
 * Requires PHP:      7.4
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Prevent direct file access
}

define( 'STELLAR_VERSION', '1.0.0' );
define( 'STELLAR_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'STELLAR_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

// Autoload classes
spl_autoload_register( function ( $class ) {
    $prefix = 'Stellar\\';
    if ( strpos( $class, $prefix ) === 0 ) {
        $file = STELLAR_PLUGIN_DIR . 'includes/' . str_replace( '\\', '/', substr( $class, strlen( $prefix ) ) ) . '.php';
        if ( file_exists( $file ) ) require $file;
    }
} );

// Activation / deactivation hooks
register_activation_hook( __FILE__, [ 'Stellar\\Activator', 'activate' ] );
register_deactivation_hook( __FILE__, [ 'Stellar\\Activator', 'deactivate' ] );

// Boot
add_action( 'plugins_loaded', function () {
    ( new Stellar\PostType() )->register();
    ( new Stellar\RestApi() )->register();
    ( new Stellar\AdminSettings() )->register();
    ( new Stellar\Shortcode() )->register();
    ( new Stellar\Block() )->register();
} );
```

## Step 2: Custom Post Type

```php
<?php
// includes/PostType.php
namespace Stellar;

class PostType {
    public function register(): void {
        add_action( 'init', [ $this, 'register_post_type' ] );
        add_action( 'init', [ $this, 'register_taxonomy' ] );
        add_action( 'add_meta_boxes', [ $this, 'add_meta_boxes' ] );
        add_action( 'save_post_stellar_review', [ $this, 'save_meta' ] );
    }

    public function register_post_type(): void {
        register_post_type( 'stellar_review', [
            'labels' => [
                'name'               => __( 'Testimonials', 'stellar-testimonials' ),
                'singular_name'      => __( 'Testimonial', 'stellar-testimonials' ),
                'add_new_item'       => __( 'Add New Testimonial', 'stellar-testimonials' ),
                'edit_item'          => __( 'Edit Testimonial', 'stellar-testimonials' ),
                'menu_name'          => __( 'Testimonials', 'stellar-testimonials' ),
            ],
            'public'       => true,
            'show_in_rest' => true,
            'supports'     => [ 'title', 'editor', 'thumbnail', 'custom-fields' ],
            'menu_icon'    => 'dashicons-format-quote',
            'has_archive'  => true,
            'rewrite'      => [ 'slug' => 'testimonials' ],
        ] );
    }

    public function register_taxonomy(): void {
        register_taxonomy( 'stellar_service', 'stellar_review', [
            'label'        => __( 'Service', 'stellar-testimonials' ),
            'hierarchical' => false,
            'show_in_rest' => true,
            'rewrite'      => [ 'slug' => 'testimonials/service' ],
        ] );
    }

    public function add_meta_boxes(): void {
        add_meta_box(
            'stellar_details',
            __( 'Review Details', 'stellar-testimonials' ),
            [ $this, 'render_meta_box' ],
            'stellar_review',
            'side',
            'high'
        );
    }

    public function render_meta_box( \WP_Post $post ): void {
        wp_nonce_field( 'stellar_save_meta', 'stellar_nonce' );
        $rating   = get_post_meta( $post->ID, '_stellar_rating', true ) ?: '5';
        $company  = get_post_meta( $post->ID, '_stellar_company', true );
        $verified = get_post_meta( $post->ID, '_stellar_verified', true );
        ?>
        <p>
            <label><?php esc_html_e( 'Rating (1–5)', 'stellar-testimonials' ); ?></label>
            <input type="number" name="stellar_rating" min="1" max="5" value="<?php echo esc_attr( $rating ); ?>" class="widefat" />
        </p>
        <p>
            <label><?php esc_html_e( 'Company', 'stellar-testimonials' ); ?></label>
            <input type="text" name="stellar_company" value="<?php echo esc_attr( $company ); ?>" class="widefat" />
        </p>
        <p>
            <label>
                <input type="checkbox" name="stellar_verified" value="1" <?php checked( $verified, '1' ); ?> />
                <?php esc_html_e( 'Verified Purchase', 'stellar-testimonials' ); ?>
            </label>
        </p>
        <?php
    }

    public function save_meta( int $post_id ): void {
        if ( ! isset( $_POST['stellar_nonce'] ) || ! wp_verify_nonce( $_POST['stellar_nonce'], 'stellar_save_meta' ) ) return;
        if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) return;
        if ( ! current_user_can( 'edit_post', $post_id ) ) return;

        if ( isset( $_POST['stellar_rating'] ) ) {
            update_post_meta( $post_id, '_stellar_rating', absint( $_POST['stellar_rating'] ) );
        }
        if ( isset( $_POST['stellar_company'] ) ) {
            update_post_meta( $post_id, '_stellar_company', sanitize_text_field( $_POST['stellar_company'] ) );
        }
        update_post_meta( $post_id, '_stellar_verified', isset( $_POST['stellar_verified'] ) ? '1' : '0' );
    }
}
```

## Step 3: REST API Endpoint

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
            'permission_callback' => '__return_true',
            'args'                => [
                'per_page' => [ 'type' => 'integer', 'default' => 10, 'sanitize_callback' => 'absint' ],
                'service'  => [ 'type' => 'string', 'sanitize_callback' => 'sanitize_text_field' ],
                'rating'   => [ 'type' => 'integer', 'sanitize_callback' => 'absint' ],
            ],
        ] );

        register_rest_route( 'stellar/v1', '/testimonials/(?P<id>\d+)', [
            'methods'             => \WP_REST_Server::READABLE,
            'callback'            => [ $this, 'get_testimonial' ],
            'permission_callback' => '__return_true',
            'args'                => [
                'id' => [ 'validate_callback' => fn( $v ) => is_numeric( $v ) ],
            ],
        ] );
    }

    public function get_testimonials( \WP_REST_Request $request ): \WP_REST_Response {
        $args = [
            'post_type'      => 'stellar_review',
            'posts_per_page' => $request->get_param( 'per_page' ),
            'post_status'    => 'publish',
            'meta_query'     => [],
        ];

        if ( $rating = $request->get_param( 'rating' ) ) {
            $args['meta_query'][] = [ 'key' => '_stellar_rating', 'value' => $rating, 'compare' => '>=' ];
        }

        if ( $service = $request->get_param( 'service' ) ) {
            $args['tax_query'] = [ [ 'taxonomy' => 'stellar_service', 'field' => 'slug', 'terms' => $service ] ];
        }

        $posts = get_posts( $args );

        $data = array_map( function ( \WP_Post $post ) {
            return [
                'id'       => $post->ID,
                'title'    => $post->post_title,
                'content'  => wp_strip_all_tags( $post->post_content ),
                'rating'   => (int) get_post_meta( $post->ID, '_stellar_rating', true ),
                'company'  => get_post_meta( $post->ID, '_stellar_company', true ),
                'verified' => get_post_meta( $post->ID, '_stellar_verified', true ) === '1',
                'date'     => $post->post_date,
                'avatar'   => get_the_post_thumbnail_url( $post->ID, 'thumbnail' ),
            ];
        }, $posts );

        return new \WP_REST_Response( $data, 200 );
    }

    public function get_testimonial( \WP_REST_Request $request ): \WP_REST_Response|\WP_Error {
        $post = get_post( $request['id'] );
        if ( ! $post || $post->post_type !== 'stellar_review' ) {
            return new \WP_Error( 'not_found', 'Testimonial not found', [ 'status' => 404 ] );
        }
        return new \WP_REST_Response( /* same shape as above */ [], 200 );
    }
}
```

## Step 4: Admin Settings Page

```php
<?php
// includes/AdminSettings.php
namespace Stellar;

class AdminSettings {
    private const OPTION_KEY = 'stellar_settings';

    public function register(): void {
        add_action( 'admin_menu', [ $this, 'add_menu' ] );
        add_action( 'admin_init', [ $this, 'register_settings' ] );
        add_action( 'admin_enqueue_scripts', [ $this, 'enqueue' ] );
    }

    public function add_menu(): void {
        add_options_page(
            __( 'Stellar Testimonials Settings', 'stellar-testimonials' ),
            __( 'Stellar Testimonials', 'stellar-testimonials' ),
            'manage_options',
            'stellar-testimonials',
            [ $this, 'render_page' ]
        );
    }

    public function register_settings(): void {
        register_setting( 'stellar_options', self::OPTION_KEY, [ 'sanitize_callback' => [ $this, 'sanitize' ] ] );

        add_settings_section( 'stellar_display', __( 'Display', 'stellar-testimonials' ), '__return_false', 'stellar-testimonials' );

        add_settings_field( 'columns', __( 'Columns per Row', 'stellar-testimonials' ), [ $this, 'field_columns' ], 'stellar-testimonials', 'stellar_display' );
        add_settings_field( 'show_rating', __( 'Show Star Rating', 'stellar-testimonials' ), [ $this, 'field_show_rating' ], 'stellar-testimonials', 'stellar_display' );
        add_settings_field( 'schema_markup', __( 'Enable Schema Markup', 'stellar-testimonials' ), [ $this, 'field_schema' ], 'stellar-testimonials', 'stellar_display' );
    }

    public function render_page(): void {
        if ( ! current_user_can( 'manage_options' ) ) return;
        ?>
        <div class="wrap">
            <h1><?php esc_html_e( 'Stellar Testimonials Settings', 'stellar-testimonials' ); ?></h1>
            <form method="post" action="options.php">
                <?php
                settings_fields( 'stellar_options' );
                do_settings_sections( 'stellar-testimonials' );
                submit_button();
                ?>
            </form>
        </div>
        <?php
    }

    public function enqueue( string $hook ): void {
        if ( $hook !== 'settings_page_stellar-testimonials' ) return;
        wp_enqueue_style( 'stellar-admin', STELLAR_PLUGIN_URL . 'assets/admin.css', [], STELLAR_VERSION );
    }

    public function sanitize( array $input ): array {
        return [
            'columns'      => absint( $input['columns'] ?? 3 ),
            'show_rating'  => ! empty( $input['show_rating'] ) ? '1' : '0',
            'schema_markup' => ! empty( $input['schema_markup'] ) ? '1' : '0',
        ];
    }
}
```

## Step 5: Shortcode and Front-End Scripts

```php
<?php
// includes/Shortcode.php — [stellar_testimonials columns="3" service="web-design"]
namespace Stellar;

class Shortcode {
    public function register(): void {
        add_shortcode( 'stellar_testimonials', [ $this, 'render' ] );
        add_action( 'wp_enqueue_scripts', [ $this, 'enqueue' ] );
    }

    public function enqueue(): void {
        if ( ! is_singular() ) return;
        global $post;
        if ( has_shortcode( $post->post_content, 'stellar_testimonials' ) ) {
            wp_enqueue_style( 'stellar-frontend', STELLAR_PLUGIN_URL . 'assets/frontend.css', [], STELLAR_VERSION );
            wp_enqueue_script( 'stellar-frontend', STELLAR_PLUGIN_URL . 'assets/frontend.js', [], STELLAR_VERSION, true );
            wp_localize_script( 'stellar-frontend', 'StellarData', [
                'apiUrl' => rest_url( 'stellar/v1/testimonials' ),
                'nonce'  => wp_create_nonce( 'wp_rest' ),
            ] );
        }
    }

    public function render( array $atts ): string {
        $atts = shortcode_atts( [ 'columns' => '3', 'service' => '', 'limit' => '6' ], $atts );
        ob_start();
        include STELLAR_PLUGIN_DIR . 'templates/testimonials.php';
        return ob_get_clean();
    }
}
```

```bash
# Deploy to WordPress.org plugin directory
# 1. Create account at https://wordpress.org/support/register.php
# 2. Submit plugin at https://wordpress.org/plugins/developers/add/
# 3. After approval, push via SVN:
svn co https://plugins.svn.wordpress.org/stellar-testimonials
cd stellar-testimonials
cp -r /path/to/plugin/* trunk/
svn add trunk/*
svn ci -m "Initial submission"

# Tag a release
svn cp trunk tags/1.0.0
svn ci -m "Tagging 1.0.0"
```

## Results

- **Reusable across 20+ client sites** — install once, configure per site; no custom code per project
- **REST API enables headless** — Next.js frontends call `/wp-json/stellar/v1/testimonials`; no page reload needed
- **Shortcode takes 30 seconds to embed** — `[stellar_testimonials columns="3"]` in any page or post; no theme edits
- **Admin settings respected site-wide** — column count, ratings display, and schema markup toggled without touching PHP
- **WordPress.org listing drives organic installs** — SEO-optimized plugin page; users install without involving developer
