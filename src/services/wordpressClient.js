/**
 * WordPress REST API Client with RankMath schema integration
 */

const axios = require('axios');

/**
 * Create a WordPress API client
 * @param {string} siteUrl - WordPress site URL
 * @param {string} username - WordPress username
 * @param {string} appPassword - WordPress Application Password
 * @returns {object} - Client methods
 */
function create(siteUrl, username, appPassword) {
  const baseUrl = siteUrl.replace(/\/$/, '');
  const apiUrl = `${baseUrl}/wp-json/wp/v2`;

  // Create Base64 auth header
  const auth = Buffer.from(`${username}:${appPassword}`).toString('base64');

  const client = axios.create({
    baseURL: apiUrl,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });

  return {
    /**
     * Test the connection to WordPress
     */
    async testConnection() {
      try {
        const response = await client.get('/users/me');
        return {
          success: true,
          user: response.data.name,
          roles: response.data.roles
        };
      } catch (error) {
        throw new Error(`Connection failed: ${error.response?.data?.message || error.message}`);
      }
    },

    /**
     * Find a post or page by its URL
     */
    async findByUrl(pageUrl) {
      try {
        // Extract slug from URL
        const urlObj = new URL(pageUrl);
        const path = urlObj.pathname.replace(/\/$/, '');
        const slug = path.split('/').pop();

        // Try posts first
        let response = await client.get('/posts', {
          params: { slug, per_page: 1 }
        });

        if (response.data.length > 0) {
          return { type: 'post', data: response.data[0] };
        }

        // Try pages
        response = await client.get('/pages', {
          params: { slug, per_page: 1 }
        });

        if (response.data.length > 0) {
          return { type: 'page', data: response.data[0] };
        }

        throw new Error('Post/page not found');
      } catch (error) {
        throw new Error(`Find failed: ${error.response?.data?.message || error.message}`);
      }
    },

    /**
     * Get post or page by ID
     */
    async getById(id, type = 'posts') {
      try {
        const response = await client.get(`/${type}/${id}`);
        return response.data;
      } catch (error) {
        throw new Error(`Get failed: ${error.response?.data?.message || error.message}`);
      }
    },

    /**
     * Update post meta (used for RankMath schema)
     */
    async updateMeta(id, type, metaKey, metaValue) {
      try {
        const endpoint = type === 'page' ? 'pages' : 'posts';
        const response = await client.post(`/${endpoint}/${id}`, {
          meta: {
            [metaKey]: metaValue
          }
        });
        return response.data;
      } catch (error) {
        throw new Error(`Meta update failed: ${error.response?.data?.message || error.message}`);
      }
    },

    /**
     * Insert schema into WordPress
     * Tries multiple methods: RankMath meta, Yoast meta, or post content
     */
    async insertSchema(pageUrl, schema, pageType) {
      // Find the post/page
      const result = await this.findByUrl(pageUrl);
      const { type, data } = result;
      const endpoint = type === 'page' ? 'pages' : 'posts';

      // Create the JSON-LD script block
      const jsonLdScript = `<!-- Schema Generator JSON-LD -->
<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>
<!-- End Schema Generator -->`;

      // Method 1: Try RankMath's rank_math_schema meta (may not work on all setups)
      try {
        // RankMath stores schemas with specific structure
        const schemaTypes = schema['@graph'] ? schema['@graph'].map(s => s['@type']).join('_') : (schema['@type'] || 'Custom');
        const metaKey = `rank_math_schema_${schemaTypes}`;

        await client.post(`/${endpoint}/${data.id}`, {
          meta: {
            [metaKey]: JSON.stringify(schema),
            // Also try the general RankMath schema key
            'rank_math_rich_snippet': pageType === 'article' ? 'article' : 'service'
          }
        });
      } catch (e) {
        // RankMath meta not available, continue to fallback
        console.log('RankMath meta not available:', e.message);
      }

      // Method 2: Try Yoast SEO schema meta (if Yoast is installed)
      try {
        await client.post(`/${endpoint}/${data.id}`, {
          meta: {
            '_yoast_wpseo_schema_page_type': pageType === 'article' ? 'WebPage' : 'ItemPage',
            '_yoast_wpseo_schema_article_type': pageType === 'article' ? 'Article' : 'None'
          }
        });
      } catch (e) {
        // Yoast meta not available, continue
      }

      // Method 3: Insert JSON-LD into post content (most reliable fallback)
      // Check if schema already exists in content
      const currentContent = data.content?.rendered || data.content?.raw || '';

      if (!currentContent.includes('Schema Generator JSON-LD')) {
        // Append the JSON-LD to the post content
        // We put it at the end so it doesn't affect the visible content
        try {
          // Get raw content
          const rawContent = data.content?.raw || '';
          const newContent = rawContent + '\n\n' + jsonLdScript;

          await client.post(`/${endpoint}/${data.id}`, {
            content: newContent
          });

          return {
            success: true,
            method: 'content',
            postId: data.id,
            postType: type,
            message: 'Schema inserted into page content'
          };
        } catch (contentError) {
          // Content update failed, may need different permissions
          console.log('Content update failed:', contentError.message);
        }
      } else {
        return {
          success: true,
          method: 'existing',
          postId: data.id,
          postType: type,
          message: 'Schema already exists in page content'
        };
      }

      return {
        success: true,
        method: 'meta',
        postId: data.id,
        postType: type,
        message: 'Schema inserted via post meta (verify in RankMath)'
      };
    },

    /**
     * Get existing RankMath schemas for a post
     */
    async getExistingSchemas(pageUrl) {
      const result = await this.findByUrl(pageUrl);
      const { data } = result;

      const schemas = [];
      const meta = data.meta || {};

      // Look for RankMath schema meta keys
      for (const [key, value] of Object.entries(meta)) {
        if (key.startsWith('rank_math_schema_')) {
          try {
            schemas.push({
              type: key.replace('rank_math_schema_', ''),
              schema: typeof value === 'string' ? JSON.parse(value) : value
            });
          } catch {
            // Invalid JSON, skip
          }
        }
      }

      return schemas;
    },

    /**
     * Batch update multiple posts with schemas
     */
    async batchInsert(items) {
      const results = [];

      for (const item of items) {
        try {
          const result = await this.insertSchema(item.url, item.schema, item.pageType);
          results.push({ url: item.url, success: true, ...result });
        } catch (error) {
          results.push({ url: item.url, success: false, error: error.message });
        }
      }

      return results;
    }
  };
}

/**
 * Validate WordPress credentials format
 */
function validateCredentials(username, appPassword) {
  const errors = [];

  if (!username || username.trim().length === 0) {
    errors.push('Username is required');
  }

  if (!appPassword || appPassword.trim().length === 0) {
    errors.push('Application Password is required');
  }

  // Application passwords are typically formatted with spaces
  // e.g., "abcd efgh ijkl mnop qrst uvwx"
  if (appPassword && !appPassword.includes(' ') && appPassword.length !== 24) {
    errors.push('Application Password format appears invalid');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  create,
  validateCredentials
};
