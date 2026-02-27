<?php
/**
 * Schema Generator Helper - WordPress REST API Endpoints
 * Version: 1.0.0
 *
 * This snippet provides secure REST API endpoints for the Schema Generator app
 * to insert JSON-LD schemas directly into WordPress/RankMath.
 *
 * INSTALLATION:
 * =============
 * 1. Install and activate the "Code Snippets" plugin on your WordPress site
 *    (https://wordpress.org/plugins/code-snippets/)
 *
 * 2. Go to Snippets > Add New
 *
 * 3. Give it a name like "Schema Generator Helper"
 *
 * 4. Paste this entire file contents into the code area
 *
 * 5. IMPORTANT: Change YOUR_SECRET_TOKEN_HERE below to a secure random string
 *    (e.g., use a password generator to create a 32+ character string)
 *
 * 6. Set the snippet to run "everywhere" or "only on site front-end + REST API"
 *
 * 7. Save and Activate the snippet
 *
 * USAGE:
 * ======
 * In the Schema Generator app:
 * 1. Select "RankMath Helper" as the connection type
 * 2. Enter your WordPress site URL
 * 3. Enter the secret token you configured below
 * 4. Click "Test Connection" to verify
 *
 * ENDPOINTS CREATED:
 * ==================
 * POST /wp-json/schema-generator/v1/find             - Find post by URL/slug
 * GET  /wp-json/schema-generator/v1/get/{id}         - Get existing schemas
 * POST /wp-json/schema-generator/v1/insert           - Insert single schema
 * POST /wp-json/schema-generator/v1/insert-multiple  - Insert multiple schemas
 * POST /wp-json/schema-generator/v1/delete           - Delete schemas
 * POST /wp-json/schema-generator/v1/get-page-html    - Fetch page HTML server-side (bypasses CDN/WAF)
 *
 * SECURITY:
 * =========
 * - All endpoints require the X-Schema-Token header with your secret token
 * - Only users with the secret token can access these endpoints
 * - Keep your secret token private and secure
 *
 * TROUBLESHOOTING:
 * ================
 * If "Schema Generator Helper plugin not found" error:
 * - Ensure this snippet is activated
 * - Check WordPress debug.log for PHP errors
 * - Verify REST API is not blocked by security plugins
 *
 * If "Invalid token" error:
 * - Verify the token in this file matches what you entered in Schema Generator
 * - Check for extra spaces or characters
 */

// ============================================================================
// CONFIGURATION - CHANGE THIS TOKEN!
// ============================================================================
// Generate a secure random string and replace YOUR_SECRET_TOKEN_HERE
// Example: 'a7b2c9d4e5f6g7h8i9j0k1l2m3n4o5p6'
define('SCHEMA_GENERATOR_SECRET', 'YOUR_SECRET_TOKEN_HERE');


// ============================================================================
// REST API REGISTRATION
// ============================================================================
add_action('rest_api_init', function() {
    $namespace = 'schema-generator/v1';

    // Find post by URL or slug
    register_rest_route($namespace, '/find', [
        'methods' => 'POST',
        'callback' => 'sg_find_post',
        'permission_callback' => 'sg_verify_token'
    ]);

    // Get existing schemas for a post
    register_rest_route($namespace, '/get/(?P<id>\d+)', [
        'methods' => 'GET',
        'callback' => 'sg_get_schemas',
        'permission_callback' => 'sg_verify_token'
    ]);

    // Insert single schema
    register_rest_route($namespace, '/insert', [
        'methods' => 'POST',
        'callback' => 'sg_insert_schema',
        'permission_callback' => 'sg_verify_token'
    ]);

    // Insert multiple schemas
    register_rest_route($namespace, '/insert-multiple', [
        'methods' => 'POST',
        'callback' => 'sg_insert_multiple_schemas',
        'permission_callback' => 'sg_verify_token'
    ]);

    // Delete schemas
    register_rest_route($namespace, '/delete', [
        'methods' => 'POST',
        'callback' => 'sg_delete_schemas',
        'permission_callback' => 'sg_verify_token'
    ]);

    // Fetch page HTML server-side (bypasses CDN/WAF)
    register_rest_route($namespace, '/get-page-html', [
        'methods' => 'POST',
        'callback' => 'sg_get_page_html',
        'permission_callback' => 'sg_verify_token'
    ]);
});


// ============================================================================
// AUTHENTICATION
// ============================================================================
function sg_verify_token($request) {
    $token = $request->get_header('X-Schema-Token');

    // Check if token is provided and matches
    if (!$token || $token !== SCHEMA_GENERATOR_SECRET) {
        return new WP_Error(
            'rest_forbidden',
            'Invalid or missing authentication token',
            ['status' => 401]
        );
    }

    return true;
}


// ============================================================================
// FIND POST BY URL OR SLUG
// ============================================================================
function sg_find_post($request) {
    $url = $request->get_param('url');
    $slug = $request->get_param('slug');

    // Extract slug from URL if provided
    if ($url) {
        $path = parse_url($url, PHP_URL_PATH);
        $slug = trim($path, '/');
        // Get the last segment (handles hierarchical URLs like /services/hvac-repair/)
        $slug = basename($slug);
    }

    if (!$slug) {
        return new WP_Error(
            'missing_param',
            'URL or slug is required',
            ['status' => 400]
        );
    }

    // Try to find by post_name (slug)
    $posts = get_posts([
        'name' => $slug,
        'post_type' => ['post', 'page', 'any'],
        'post_status' => 'publish',
        'numberposts' => 1
    ]);

    // If not found, try url_to_postid for hierarchical pages
    if (empty($posts)) {
        $post_id = url_to_postid($url ?: home_url($slug));
        if ($post_id) {
            $posts = [get_post($post_id)];
        }
    }

    // Still not found
    if (empty($posts)) {
        return new WP_Error(
            'not_found',
            "Post not found for slug: {$slug}",
            ['status' => 404]
        );
    }

    $post = $posts[0];

    return [
        'success' => true,
        'post_id' => $post->ID,
        'post_title' => $post->post_title,
        'post_slug' => $post->post_name,
        'post_type' => $post->post_type,
        'post_url' => get_permalink($post->ID)
    ];
}


// ============================================================================
// GET EXISTING SCHEMAS
// ============================================================================
function sg_get_schemas($request) {
    $post_id = (int) $request['id'];

    if (!$post_id) {
        return new WP_Error(
            'missing_param',
            'Post ID is required',
            ['status' => 400]
        );
    }

    // Verify post exists
    $post = get_post($post_id);
    if (!$post) {
        return new WP_Error(
            'not_found',
            "Post ID {$post_id} not found",
            ['status' => 404]
        );
    }

    $schemas = [];

    // Get all RankMath schema meta for this post
    global $wpdb;
    $meta_rows = $wpdb->get_results($wpdb->prepare(
        "SELECT meta_key, meta_value FROM {$wpdb->postmeta}
         WHERE post_id = %d AND meta_key LIKE 'rank_math_schema_%%'",
        $post_id
    ));

    foreach ($meta_rows as $row) {
        $type = str_replace('rank_math_schema_', '', $row->meta_key);
        $value = maybe_unserialize($row->meta_value);

        $schemas[] = [
            'meta_key' => $row->meta_key,
            'type' => $type,
            'value' => $value
        ];
    }

    // Also get the rich snippet type setting
    $snippet_type = get_post_meta($post_id, 'rank_math_rich_snippet', true);

    return [
        'success' => true,
        'post_id' => $post_id,
        'post_title' => $post->post_title,
        'schemas' => $schemas,
        'schema_count' => count($schemas),
        'rich_snippet_type' => $snippet_type ?: null
    ];
}


// ============================================================================
// INSERT SINGLE SCHEMA
// ============================================================================
function sg_insert_schema($request) {
    $post_id = (int) $request->get_param('post_id');
    $schema = $request->get_param('schema');
    $schema_type = $request->get_param('schema_type');
    $is_primary = $request->get_param('is_primary') !== false;

    // Validation
    if (!$post_id) {
        return new WP_Error('missing_param', 'post_id is required', ['status' => 400]);
    }
    if (!$schema) {
        return new WP_Error('missing_param', 'schema is required', ['status' => 400]);
    }

    // Verify post exists
    $post = get_post($post_id);
    if (!$post) {
        return new WP_Error('not_found', "Post ID {$post_id} not found", ['status' => 404]);
    }

    // Auto-detect schema type from @type if not provided
    if (!$schema_type && isset($schema['@type'])) {
        $schema_type = is_array($schema['@type']) ? $schema['@type'][0] : $schema['@type'];
    }
    $schema_type = $schema_type ?: 'Custom';

    // Remove @context if present (RankMath adds this automatically)
    unset($schema['@context']);

    // Build RankMath-compatible schema format
    $rm_schema = sg_build_rankmath_schema($schema, $schema_type, $is_primary);

    // Save to postmeta
    $meta_key = 'rank_math_schema_' . $schema_type;
    $result = update_post_meta($post_id, $meta_key, $rm_schema);

    // Set rich snippet type if this is the primary schema
    if ($is_primary) {
        $snippet_types = [
            'Article' => 'article',
            'BlogPosting' => 'article',
            'NewsArticle' => 'article',
            'Service' => 'service',
            'LocalBusiness' => 'local_business',
            'HVACBusiness' => 'local_business',
            'Plumber' => 'local_business',
            'Electrician' => 'local_business',
            'Product' => 'product',
            'FAQPage' => 'faq',
            'HowTo' => 'howto',
            'Recipe' => 'recipe',
            'Event' => 'event',
            'Course' => 'course',
            'VideoObject' => 'video',
            'JobPosting' => 'job_posting',
        ];

        if (isset($snippet_types[$schema_type])) {
            update_post_meta($post_id, 'rank_math_rich_snippet', $snippet_types[$schema_type]);
        }
    }

    return [
        'success' => true,
        'post_id' => $post_id,
        'post_title' => $post->post_title,
        'meta_key' => $meta_key,
        'schema_type' => $schema_type,
        'is_primary' => $is_primary,
        'updated' => $result !== false
    ];
}


// ============================================================================
// INSERT MULTIPLE SCHEMAS
// ============================================================================
function sg_insert_multiple_schemas($request) {
    $post_id = (int) $request->get_param('post_id');
    $schemas = $request->get_param('schemas');

    // Validation
    if (!$post_id) {
        return new WP_Error('missing_param', 'post_id is required', ['status' => 400]);
    }
    if (!$schemas || !is_array($schemas)) {
        return new WP_Error('missing_param', 'schemas array is required', ['status' => 400]);
    }

    // Verify post exists
    $post = get_post($post_id);
    if (!$post) {
        return new WP_Error('not_found', "Post ID {$post_id} not found", ['status' => 404]);
    }

    $results = [];
    $is_first = true;

    foreach ($schemas as $item) {
        // Handle both { schema, type } objects and plain schema objects
        $schema = isset($item['schema']) ? $item['schema'] : $item;
        $type = isset($item['type']) ? $item['type'] : null;

        // Auto-detect type from @type
        if (!$type && isset($schema['@type'])) {
            $type = is_array($schema['@type']) ? $schema['@type'][0] : $schema['@type'];
        }
        $type = $type ?: 'Custom';

        // Remove @context
        unset($schema['@context']);

        // Build RankMath format (first schema is primary)
        $rm_schema = sg_build_rankmath_schema($schema, $type, $is_first);

        // Save
        $meta_key = 'rank_math_schema_' . $type;
        $result = update_post_meta($post_id, $meta_key, $rm_schema);

        $results[] = [
            'type' => $type,
            'meta_key' => $meta_key,
            'is_primary' => $is_first,
            'success' => $result !== false
        ];

        // Set rich snippet type for primary (first) schema
        if ($is_first) {
            $snippet_types = [
                'Article' => 'article',
                'Service' => 'service',
                'LocalBusiness' => 'local_business',
                'HVACBusiness' => 'local_business',
                'Product' => 'product',
                'FAQPage' => 'faq',
            ];
            if (isset($snippet_types[$type])) {
                update_post_meta($post_id, 'rank_math_rich_snippet', $snippet_types[$type]);
            }
        }

        $is_first = false;
    }

    return [
        'success' => true,
        'post_id' => $post_id,
        'post_title' => $post->post_title,
        'schemas_inserted' => count($results),
        'results' => $results
    ];
}


// ============================================================================
// DELETE SCHEMAS
// ============================================================================
function sg_delete_schemas($request) {
    $post_id = (int) $request->get_param('post_id');
    $schema_type = $request->get_param('schema_type');

    if (!$post_id) {
        return new WP_Error('missing_param', 'post_id is required', ['status' => 400]);
    }

    // Verify post exists
    $post = get_post($post_id);
    if (!$post) {
        return new WP_Error('not_found', "Post ID {$post_id} not found", ['status' => 404]);
    }

    global $wpdb;

    if ($schema_type) {
        // Delete specific schema type
        $meta_key = 'rank_math_schema_' . $schema_type;
        $deleted = delete_post_meta($post_id, $meta_key);

        return [
            'success' => true,
            'post_id' => $post_id,
            'deleted_type' => $schema_type,
            'deleted' => $deleted
        ];
    } else {
        // Delete ALL schema meta for this post
        $count = $wpdb->query($wpdb->prepare(
            "DELETE FROM {$wpdb->postmeta}
             WHERE post_id = %d AND meta_key LIKE 'rank_math_schema_%%'",
            $post_id
        ));

        return [
            'success' => true,
            'post_id' => $post_id,
            'deleted_count' => $count,
            'message' => "Deleted {$count} schema(s) from post"
        ];
    }
}


// ============================================================================
// FETCH PAGE HTML (SERVER-SIDE, BYPASSES CDN/WAF)
// ============================================================================
function sg_get_page_html($request) {
    $url = $request->get_param('url');

    if (!$url) {
        return new WP_Error(
            'missing_param',
            'URL is required',
            ['status' => 400]
        );
    }

    $response = wp_remote_get($url, [
        'timeout'   => 30,
        'sslverify' => false
    ]);

    if (is_wp_error($response)) {
        return new WP_Error(
            'fetch_failed',
            $response->get_error_message(),
            ['status' => 500]
        );
    }

    return [
        'success'     => true,
        'html'        => wp_remote_retrieve_body($response),
        'status_code' => wp_remote_retrieve_response_code($response)
    ];
}


// ============================================================================
// HELPER: BUILD RANKMATH SCHEMA FORMAT
// ============================================================================
/**
 * Convert a JSON-LD schema to RankMath's internal format
 *
 * RankMath stores schemas with a 'metadata' object that includes:
 * - title: Schema type name
 * - type: Always 'custom' for our schemas
 * - shortcode: Unique ID for the schema
 * - isPrimary: '1' for the main schema on a page
 * - name/description: Can use RankMath variables
 *
 * @param array $schema The JSON-LD schema
 * @param string $type The schema type (Service, Article, etc.)
 * @param bool $is_primary Whether this is the primary schema for the page
 * @return array RankMath-formatted schema
 */
function sg_build_rankmath_schema($schema, $type, $is_primary = false) {
    // Generate unique shortcode ID
    $shortcode_id = 's-' . substr(md5(uniqid(mt_rand(), true)), 0, 12);

    if ($is_primary) {
        // Primary schema has more metadata
        $metadata = [
            'title' => $type,
            'type' => 'custom',
            'shortcode' => $shortcode_id,
            'isPrimary' => '1',
            'name' => '%seo_title%',
            'description' => '%seo_description%',
            'reviewLocationShortcode' => '[rank_math_rich_snippet]'
        ];
    } else {
        // Secondary schemas have minimal metadata
        $metadata = [
            'type' => 'custom',
            'title' => $type
        ];
    }

    // Merge metadata with schema (metadata must be first)
    return array_merge(['metadata' => $metadata], $schema);
}
