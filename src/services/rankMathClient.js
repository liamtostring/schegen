/**
 * RankMath REST API Client
 *
 * Connects to WordPress sites with the Schema Generator Helper plugin installed.
 * Works with any site - just provide the site URL and secret token.
 *
 * Helper plugin endpoints:
 * - POST /wp-json/schema-generator/v1/insert
 * - POST /wp-json/schema-generator/v1/insert-multiple
 * - POST /wp-json/schema-generator/v1/delete
 * - GET  /wp-json/schema-generator/v1/get/{post_id}
 * - POST /wp-json/schema-generator/v1/find
 */

const axios = require('axios');

/**
 * Create a RankMath client for a WordPress site
 * @param {object} config - Configuration
 * @param {string} config.siteUrl - WordPress site URL (e.g., https://example.com)
 * @param {string} config.secretToken - The secret token configured in the helper plugin
 * @param {number} config.timeout - Request timeout in ms (default: 30000)
 * @returns {object} - Client methods
 */
function create(config) {
  const { siteUrl, secretToken, timeout = 30000 } = config;

  if (!siteUrl || !secretToken) {
    throw new Error('siteUrl and secretToken are required');
  }

  const baseUrl = siteUrl.replace(/\/$/, '');
  const apiUrl = `${baseUrl}/wp-json/schema-generator/v1`;

  const client = axios.create({
    baseURL: apiUrl,
    headers: {
      'Content-Type': 'application/json',
      'X-Schema-Token': secretToken
    },
    timeout
  });

  return {
    /**
     * Test connection to the helper plugin
     */
    async testConnection() {
      try {
        // Try to call the find endpoint with a test URL (must have a path for slug extraction)
        const response = await client.post('/find', { url: `${baseUrl}/test-connection-check` });
        return {
          success: true,
          message: 'Connected to Schema Generator Helper',
          siteUrl: baseUrl
        };
      } catch (error) {
        // Check if it's an auth error
        if (error.response?.status === 401 || error.response?.data?.code === 'rest_forbidden') {
          throw new Error('Invalid secret token');
        }
        // If we get 'not_found' or 'missing_param', the plugin IS working
        // (just no post found or bad test slug — expected for a connection test)
        if (error.response?.data?.code === 'not_found' || error.response?.data?.code === 'missing_param') {
          return {
            success: true,
            message: 'Connected to Schema Generator Helper',
            siteUrl: baseUrl
          };
        }
        // If the route doesn't exist at all, WordPress returns 'rest_no_route'
        if (error.response?.data?.code === 'rest_no_route') {
          throw new Error('Schema Generator Helper plugin not found. Make sure the snippet is installed and activated.');
        }
        // Generic 404 without our error code means plugin not installed
        if (error.response?.status === 404 && !error.response?.data?.code) {
          throw new Error('Schema Generator Helper plugin not found. Make sure the snippet is installed and activated.');
        }
        throw new Error(`Connection failed: ${error.message}`);
      }
    },

    /**
     * Find a post by slug or URL
     * @param {string} slugOrUrl - Post slug or full URL
     * @returns {object} - Post info with ID, title, slug, type
     */
    async findPost(slugOrUrl) {
      try {
        const isUrl = slugOrUrl.startsWith('http');
        const payload = isUrl ? { url: slugOrUrl } : { slug: slugOrUrl };

        const response = await client.post('/find', payload);
        return response.data;
      } catch (error) {
        throw new Error(`Find post failed: ${error.response?.data?.message || error.message}`);
      }
    },

    /**
     * Get existing RankMath schemas for a post
     * @param {number} postId - WordPress post ID
     * @returns {object} - Post info and schemas array
     */
    async getSchemas(postId) {
      try {
        const response = await client.get(`/get/${postId}`);
        return response.data;
      } catch (error) {
        throw new Error(`Get schemas failed: ${error.response?.data?.message || error.message}`);
      }
    },

    /**
     * Insert a single schema
     * @param {number} postId - WordPress post ID
     * @param {object} schema - JSON-LD schema object
     * @param {object} options - Options
     * @param {string} options.schemaType - Schema type (auto-detected if not provided)
     * @param {boolean} options.isPrimary - Whether this is the primary schema (default: true)
     */
    async insertSchema(postId, schema, options = {}) {
      const { schemaType, isPrimary = true } = options;

      try {
        const response = await client.post('/insert', {
          post_id: postId,
          schema,
          schema_type: schemaType,
          is_primary: isPrimary
        });
        return response.data;
      } catch (error) {
        throw new Error(`Insert schema failed: ${error.response?.data?.message || error.message}`);
      }
    },

    /**
     * Insert multiple schemas at once
     * First schema is treated as primary
     * @param {number} postId - WordPress post ID
     * @param {Array} schemas - Array of {schema, type} objects
     */
    async insertMultipleSchemas(postId, schemas) {
      try {
        const response = await client.post('/insert-multiple', {
          post_id: postId,
          schemas
        });
        return response.data;
      } catch (error) {
        throw new Error(`Insert multiple schemas failed: ${error.response?.data?.message || error.message}`);
      }
    },

    /**
     * Delete schemas from a post
     * @param {number} postId - WordPress post ID
     * @param {string} schemaType - Optional: delete only this type, or all if not specified
     */
    async deleteSchemas(postId, schemaType = null) {
      try {
        const payload = { post_id: postId };
        if (schemaType) {
          payload.schema_type = schemaType;
        }

        const response = await client.post('/delete', payload);
        return response.data;
      } catch (error) {
        throw new Error(`Delete schemas failed: ${error.response?.data?.message || error.message}`);
      }
    },

    /**
     * Insert schema by URL - finds the post first, then inserts
     * @param {string} pageUrl - Full page URL
     * @param {object} schema - JSON-LD schema object
     * @param {object} options - Options
     */
    async insertByUrl(pageUrl, schema, options = {}) {
      // Find the post first
      const postInfo = await this.findPost(pageUrl);

      if (!postInfo.success) {
        throw new Error(`Post not found for URL: ${pageUrl}`);
      }

      // Insert the schema
      return this.insertSchema(postInfo.post_id, schema, options);
    },

    /**
     * Insert multiple schemas by URL
     * @param {string} pageUrl - Full page URL
     * @param {Array} schemas - Array of {schema, type} objects
     */
    async insertMultipleByUrl(pageUrl, schemas) {
      // Find the post first
      const postInfo = await this.findPost(pageUrl);

      if (!postInfo.success) {
        throw new Error(`Post not found for URL: ${pageUrl}`);
      }

      // Insert the schemas
      return this.insertMultipleSchemas(postInfo.post_id, schemas);
    },

    /**
     * Fetch page HTML server-side via the helper plugin (bypasses CDN/WAF)
     * @param {string} url - URL to fetch
     * @returns {object} - { success, html, status_code }
     */
    async getPageHtml(url) {
      try {
        const response = await client.post('/get-page-html', { url });
        return response.data;
      } catch (error) {
        throw new Error(`Helper fetch failed: ${error.response?.data?.message || error.message}`);
      }
    },

    /**
     * Full workflow: Generate schema info for a page
     * @param {string} pageUrl - Full page URL
     * @returns {object} - Post info with existing schemas
     */
    async getPageInfo(pageUrl) {
      const postInfo = await this.findPost(pageUrl);

      if (!postInfo.success) {
        return postInfo;
      }

      const schemas = await this.getSchemas(postInfo.post_id);

      return {
        ...postInfo,
        existingSchemas: schemas.schemas || []
      };
    }
  };
}

/**
 * Supported schema types (for reference)
 */
const SCHEMA_TYPES = [
  'Service', 'LocalBusiness', 'Organization',
  'Article', 'NewsArticle', 'BlogPosting',
  'FAQPage', 'HowTo',
  'Product', 'Offer',
  'Event', 'Person', 'Recipe', 'VideoObject',
  'Course', 'JobPosting', 'SoftwareApplication', 'Book',
  'Review', 'AggregateRating', 'Place', 'BreadcrumbList', 'WebPage'
];

module.exports = {
  create,
  SCHEMA_TYPES
};
