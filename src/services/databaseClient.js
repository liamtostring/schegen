/**
 * Direct Database Client for WordPress/RankMath schema injection
 *
 * SAFETY FEATURES:
 * - Dry-run mode (default) - shows what would happen without making changes
 * - Automatic backup of existing meta before any modification
 * - Rollback capability to restore previous state
 * - Read-only test methods to verify connection
 *
 * RANKMATH FORMAT:
 * - Schemas are stored as PHP serialized arrays in wp_postmeta
 * - Meta key format: rank_math_schema_{SchemaType}
 * - Value includes 'metadata' object with title, type, isPrimary, etc.
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Persistent backup storage
const DATA_DIR = path.join(__dirname, '../../data');
const BACKUPS_FILE = path.join(DATA_DIR, 'backups.json');
const MAX_BACKUPS = 50;

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load persisted backups from file
let persistedBackups = {};
try {
  if (fs.existsSync(BACKUPS_FILE)) {
    persistedBackups = JSON.parse(fs.readFileSync(BACKUPS_FILE, 'utf8'));
  }
} catch (e) {
  console.warn('Could not load backups file:', e.message);
  persistedBackups = {};
}

/**
 * Save backups to file, merging with existing and pruning old entries
 */
function saveBackupsToFile(backupsMap, host, database) {
  const storageKey = `${host}:${database}`;
  if (!persistedBackups[storageKey]) {
    persistedBackups[storageKey] = {};
  }

  for (const [postId, backup] of backupsMap) {
    persistedBackups[storageKey][postId] = backup;
  }

  // Prune to MAX_BACKUPS per storage key
  const entries = Object.entries(persistedBackups[storageKey]);
  if (entries.length > MAX_BACKUPS) {
    entries.sort((a, b) => new Date(b[1].timestamp) - new Date(a[1].timestamp));
    persistedBackups[storageKey] = Object.fromEntries(entries.slice(0, MAX_BACKUPS));
  }

  try {
    fs.writeFileSync(BACKUPS_FILE, JSON.stringify(persistedBackups, null, 2));
  } catch (e) {
    console.error('Failed to save backups file:', e.message);
  }
}

/**
 * Load a specific backup from file
 */
function loadBackupFromFile(postId, host, database) {
  const storageKey = `${host}:${database}`;
  return persistedBackups[storageKey]?.[postId] || null;
}

/**
 * List all persisted backups for a host/database
 */
function listPersistedBackups(host, database) {
  const storageKey = `${host}:${database}`;
  const backups = persistedBackups[storageKey] || {};
  return Object.entries(backups).map(([postId, backup]) => ({
    postId: parseInt(postId),
    timestamp: backup.timestamp,
    schemaCount: backup.schemas.length
  }));
}

/**
 * PHP Serialization - converts JS objects to PHP serialize() format
 * WordPress stores meta values using PHP's serialize() function
 */
function phpSerialize(value) {
  if (value === null || value === undefined) {
    return 'N;';
  }
  if (typeof value === 'boolean') {
    return 'b:' + (value ? '1' : '0') + ';';
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return 'i:' + value + ';';
    }
    return 'd:' + value + ';';
  }
  if (typeof value === 'string') {
    return 's:' + Buffer.byteLength(value, 'utf8') + ':"' + value + '";';
  }
  if (Array.isArray(value)) {
    let result = 'a:' + value.length + ':{';
    value.forEach((item, index) => {
      result += phpSerialize(index) + phpSerialize(item);
    });
    result += '}';
    return result;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    let result = 'a:' + keys.length + ':{';
    keys.forEach(key => {
      result += phpSerialize(key) + phpSerialize(value[key]);
    });
    result += '}';
    return result;
  }
  return 'N;';
}

/**
 * Supported RankMath schema types and their configurations
 */
const SCHEMA_TYPES = {
  // Business/Organization types
  Service: { title: 'Service', canBePrimary: true },
  LocalBusiness: { title: 'LocalBusiness', canBePrimary: true },
  Organization: { title: 'Organization', canBePrimary: true },

  // Content types
  Article: { title: 'Article', canBePrimary: true },
  NewsArticle: { title: 'NewsArticle', canBePrimary: true },
  BlogPosting: { title: 'BlogPosting', canBePrimary: true },

  // Page types
  FAQPage: { title: 'FAQPage', canBePrimary: false },
  HowTo: { title: 'HowTo', canBePrimary: true },

  // Product/Commerce
  Product: { title: 'Product', canBePrimary: true },
  Offer: { title: 'Offer', canBePrimary: false },

  // Event
  Event: { title: 'Event', canBePrimary: true },

  // Person
  Person: { title: 'Person', canBePrimary: true },

  // Reviews/Ratings
  Review: { title: 'Review', canBePrimary: false },
  AggregateRating: { title: 'AggregateRating', canBePrimary: false },

  // Recipe
  Recipe: { title: 'Recipe', canBePrimary: true },

  // Video
  VideoObject: { title: 'VideoObject', canBePrimary: true },

  // Course
  Course: { title: 'Course', canBePrimary: true },

  // Job
  JobPosting: { title: 'JobPosting', canBePrimary: true },

  // Software
  SoftwareApplication: { title: 'SoftwareApplication', canBePrimary: true },

  // Book
  Book: { title: 'Book', canBePrimary: true },

  // Place types
  Place: { title: 'Place', canBePrimary: false },

  // Breadcrumb
  BreadcrumbList: { title: 'BreadcrumbList', canBePrimary: false },

  // WebPage types
  WebPage: { title: 'WebPage', canBePrimary: false },

  // Custom/fallback
  Custom: { title: 'Custom', canBePrimary: true }
};

/**
 * Convert a JSON-LD schema to RankMath's internal format
 * @param {object} schema - JSON-LD schema object
 * @param {string} schemaType - The schema type (e.g., 'Service', 'FAQPage')
 * @param {object} options - Additional options
 * @param {boolean} options.isPrimary - Whether this is the primary schema for the page
 * @returns {object} - RankMath formatted schema with metadata
 */
function convertToRankMathFormat(schema, schemaType, options = {}) {
  const { isPrimary = false } = options;
  const typeConfig = SCHEMA_TYPES[schemaType] || SCHEMA_TYPES.Custom;

  // Build metadata based on whether it's a primary schema
  let metadata;

  if (isPrimary && typeConfig.canBePrimary) {
    // Primary schema format (like Service)
    metadata = {
      title: typeConfig.title,
      type: 'custom',
      shortcode: 's-' + generateShortcodeId(),
      isPrimary: '1',
      name: '%seo_title%',
      description: '%seo_description%',
      reviewLocationShortcode: '[rank_math_rich_snippet]'
    };
  } else {
    // Secondary schema format (like FAQPage)
    metadata = {
      type: 'custom',
      title: typeConfig.title
    };
  }

  // Build the RankMath schema object
  // Remove @context if present (RankMath adds this automatically)
  const schemaWithoutContext = { ...schema };
  delete schemaWithoutContext['@context'];

  // If schema has @graph, we need to handle it differently
  // RankMath typically stores individual schemas, not @graph structures
  if (schemaWithoutContext['@graph']) {
    // For @graph schemas, just use the schema fields directly
    // The caller should extract individual schemas from @graph
    console.warn('Warning: @graph schemas should be split into individual schemas');
  }

  return {
    metadata,
    ...schemaWithoutContext
  };
}

/**
 * Generate a unique shortcode ID
 */
function generateShortcodeId() {
  return Math.random().toString(16).slice(2, 15);
}

/**
 * Extract schema type from a JSON-LD schema object
 * @param {object} schema - JSON-LD schema
 * @returns {string} - The schema type
 */
function extractSchemaType(schema) {
  if (!schema) return 'Custom';

  const type = schema['@type'];
  if (!type) return 'Custom';

  // Handle array types (e.g., ["WebPage", "FAQPage"])
  if (Array.isArray(type)) {
    // Prefer the more specific type
    for (const t of type) {
      if (SCHEMA_TYPES[t]) {
        return t;
      }
    }
    return type[0];
  }

  return type;
}

/**
 * Create a direct database client for WordPress
 * @param {object} config - Database configuration
 * @param {string} config.host - Database host
 * @param {string} config.user - Database username
 * @param {string} config.password - Database password
 * @param {string} config.database - Database name
 * @param {string} config.tablePrefix - WordPress table prefix (default: 'wp_')
 * @returns {object} - Client methods
 */
async function create(config) {
  // Sanitize table prefix to prevent SQL injection
  // Only allow alphanumeric characters and underscores
  const rawPrefix = config.tablePrefix || 'wp_';
  const tablePrefix = rawPrefix.replace(/[^a-zA-Z0-9_]/g, '');
  if (tablePrefix !== rawPrefix) {
    console.warn(`Table prefix sanitized from "${rawPrefix}" to "${tablePrefix}"`);
  }
  let connection = null;

  // Backup storage for rollback capability
  const backups = new Map();

  /**
   * Get or create database connection
   */
  async function getConnection() {
    if (!connection) {
      connection = await mysql.createConnection({
        host: config.host,
        user: config.user,
        password: config.password,
        database: config.database,
        port: config.port || 3306
      });
    }
    return connection;
  }

  return {
    /**
     * Test database connection (READ-ONLY)
     */
    async testConnection() {
      try {
        const conn = await getConnection();
        const [rows] = await conn.execute('SELECT 1 as test');

        // Also verify WordPress tables exist
        const [tables] = await conn.execute(
          `SHOW TABLES LIKE '${tablePrefix}postmeta'`
        );

        if (tables.length === 0) {
          throw new Error(`WordPress table ${tablePrefix}postmeta not found`);
        }

        return {
          success: true,
          message: 'Database connection successful',
          tablePrefix
        };
      } catch (error) {
        throw new Error(`Database connection failed: ${error.message}`);
      }
    },

    /**
     * Get post ID by slug (READ-ONLY)
     */
    async getPostIdBySlug(slug) {
      const conn = await getConnection();
      const [rows] = await conn.execute(
        `SELECT ID, post_title, post_type, post_status
         FROM ${tablePrefix}posts
         WHERE post_name = ? AND post_status = 'publish'`,
        [slug]
      );

      if (rows.length === 0) {
        return null;
      }

      return rows[0];
    },

    /**
     * Get all RankMath schema meta for a post (READ-ONLY)
     */
    async getExistingSchemas(postId) {
      const conn = await getConnection();
      const [rows] = await conn.execute(
        `SELECT meta_id, meta_key, meta_value
         FROM ${tablePrefix}postmeta
         WHERE post_id = ? AND meta_key LIKE 'rank_math%'`,
        [postId]
      );

      return rows.map(row => ({
        metaId: row.meta_id,
        key: row.meta_key,
        value: row.meta_value
      }));
    },

    /**
     * Preview what schema insertion would do (DRY-RUN)
     * Does NOT make any changes to the database
     */
    async previewInsertion(postId, schema, schemaType = null, options = {}) {
      const conn = await getConnection();

      // Check if post exists
      const [posts] = await conn.execute(
        `SELECT ID, post_title FROM ${tablePrefix}posts WHERE ID = ?`,
        [postId]
      );

      if (posts.length === 0) {
        return {
          success: false,
          error: `Post ID ${postId} not found`
        };
      }

      // Auto-detect schema type if not provided
      const detectedType = schemaType || extractSchemaType(schema);

      // Build meta key
      const metaKey = `rank_math_schema_${detectedType}`;

      // Convert to RankMath format
      const rankMathSchema = convertToRankMathFormat(schema, detectedType, options);
      const metaValue = phpSerialize(rankMathSchema);

      // Check for existing meta with this key
      const [existing] = await conn.execute(
        `SELECT meta_id, meta_value FROM ${tablePrefix}postmeta
         WHERE post_id = ? AND meta_key = ?`,
        [postId, metaKey]
      );

      return {
        success: true,
        dryRun: true,
        postId,
        postTitle: posts[0].post_title,
        schemaType: detectedType,
        metaKey,
        metaValueLength: metaValue.length,
        action: existing.length > 0 ? 'UPDATE' : 'INSERT',
        existingMetaId: existing.length > 0 ? existing[0].meta_id : null,
        existingValueLength: existing.length > 0 ? existing[0].meta_value?.length : 0,
        message: existing.length > 0
          ? `Would UPDATE existing meta (ID: ${existing[0].meta_id})`
          : `Would INSERT new meta row`
      };
    },

    /**
     * Backup existing meta before modification
     * Stores in memory and persists to file
     */
    async backupMeta(postId) {
      const existing = await this.getExistingSchemas(postId);
      backups.set(postId, {
        timestamp: new Date().toISOString(),
        schemas: existing
      });

      // Persist to file
      saveBackupsToFile(backups, config.host, config.database);

      return {
        success: true,
        postId,
        backedUp: existing.length,
        backupId: postId
      };
    },

    /**
     * Insert schema into database using RankMath's internal format
     * REQUIRES explicit dryRun: false to make actual changes
     *
     * @param {number} postId - WordPress post ID
     * @param {object|string} schema - JSON-LD schema object
     * @param {string} schemaType - Schema type (e.g., 'Service', 'FAQPage') - auto-detected if null
     * @param {object} options - Options
     * @param {boolean} options.dryRun - If true (default), only preview changes
     * @param {boolean} options.backup - If true (default), backup existing meta first
     * @param {boolean} options.isPrimary - If true, format as primary schema
     */
    async insertSchema(postId, schema, schemaType = null, options = {}) {
      const { dryRun = true, backup = true, isPrimary = false } = options;

      // Auto-detect schema type if not provided
      const detectedType = schemaType || extractSchemaType(schema);

      // Always preview first
      const preview = await this.previewInsertion(postId, schema, detectedType, { isPrimary });
      if (!preview.success) {
        return preview;
      }

      // If dry-run mode, just return the preview
      if (dryRun) {
        return {
          ...preview,
          message: '[DRY-RUN] ' + preview.message + ' - Pass { dryRun: false } to execute'
        };
      }

      const conn = await getConnection();
      const metaKey = `rank_math_schema_${detectedType}`;

      // Convert to RankMath format and serialize
      const rankMathSchema = convertToRankMathFormat(schema, detectedType, { isPrimary });
      const metaValue = phpSerialize(rankMathSchema);

      // Backup existing meta if requested
      if (backup) {
        await this.backupMeta(postId);
      }

      try {
        if (preview.action === 'UPDATE') {
          // Update existing meta
          await conn.execute(
            `UPDATE ${tablePrefix}postmeta
             SET meta_value = ?
             WHERE post_id = ? AND meta_key = ?`,
            [metaValue, postId, metaKey]
          );

          return {
            success: true,
            action: 'UPDATE',
            postId,
            metaKey,
            schemaType: detectedType,
            metaId: preview.existingMetaId,
            message: `Updated existing ${detectedType} schema (meta ID: ${preview.existingMetaId})`,
            canRollback: backup
          };
        } else {
          // Insert new meta
          const [result] = await conn.execute(
            `INSERT INTO ${tablePrefix}postmeta (post_id, meta_key, meta_value)
             VALUES (?, ?, ?)`,
            [postId, metaKey, metaValue]
          );

          return {
            success: true,
            action: 'INSERT',
            postId,
            metaKey,
            schemaType: detectedType,
            metaId: result.insertId,
            message: `Inserted new ${detectedType} schema (meta ID: ${result.insertId})`,
            canRollback: backup
          };
        }
      } catch (error) {
        return {
          success: false,
          error: error.message,
          canRollback: backup
        };
      }
    },

    /**
     * Insert multiple schemas at once (e.g., Service + FAQPage)
     * The first schema in the array is treated as primary
     *
     * @param {number} postId - WordPress post ID
     * @param {Array} schemas - Array of {schema, type} objects
     * @param {object} options - Options
     */
    async insertMultipleSchemas(postId, schemas, options = {}) {
      const { dryRun = true, backup = true } = options;
      const results = [];

      // Backup once before all insertions
      if (backup && !dryRun) {
        await this.backupMeta(postId);
      }

      for (let i = 0; i < schemas.length; i++) {
        const { schema, type } = schemas[i];
        const isPrimary = i === 0; // First schema is primary

        const result = await this.insertSchema(postId, schema, type, {
          dryRun,
          backup: false, // Already backed up
          isPrimary
        });

        results.push(result);
      }

      return {
        success: results.every(r => r.success),
        results,
        canRollback: backup && !dryRun
      };
    },

    /**
     * Insert schemas from a JSON-LD @graph structure
     * Automatically splits the graph into individual schemas
     *
     * @param {number} postId - WordPress post ID
     * @param {object} graphSchema - JSON-LD schema with @graph array
     * @param {object} options - Options
     * @param {string} options.primaryType - Which schema type should be primary (default: first Service or Article found)
     */
    async insertFromGraph(postId, graphSchema, options = {}) {
      const { dryRun = true, backup = true, primaryType = null } = options;

      if (!graphSchema['@graph'] || !Array.isArray(graphSchema['@graph'])) {
        return {
          success: false,
          error: 'Schema does not contain @graph array'
        };
      }

      const schemas = [];
      let primaryIndex = 0;

      // Extract individual schemas from @graph
      graphSchema['@graph'].forEach((item, index) => {
        const type = extractSchemaType(item);

        // Skip WebSite, Organization if they're just references
        // (RankMath typically handles these globally)
        if (['WebSite', 'Organization', 'Place', 'ImageObject'].includes(type)) {
          // Only include if it has substantial content
          if (Object.keys(item).length <= 3) {
            return;
          }
        }

        schemas.push({ schema: item, type });

        // Determine primary schema
        if (primaryType && type === primaryType) {
          primaryIndex = schemas.length - 1;
        } else if (!primaryType && (type === 'Service' || type === 'Article' || type === 'Product')) {
          primaryIndex = schemas.length - 1;
        }
      });

      // Reorder so primary is first
      if (primaryIndex > 0) {
        const primary = schemas.splice(primaryIndex, 1)[0];
        schemas.unshift(primary);
      }

      return this.insertMultipleSchemas(postId, schemas, { dryRun, backup });
    },

    /**
     * Also set rank_math_rich_snippet meta
     */
    async setRichSnippetType(postId, snippetType, options = {}) {
      const { dryRun = true } = options;

      const conn = await getConnection();
      const metaKey = 'rank_math_rich_snippet';

      // Check existing
      const [existing] = await conn.execute(
        `SELECT meta_id, meta_value FROM ${tablePrefix}postmeta
         WHERE post_id = ? AND meta_key = ?`,
        [postId, metaKey]
      );

      if (dryRun) {
        return {
          success: true,
          dryRun: true,
          postId,
          metaKey,
          newValue: snippetType,
          action: existing.length > 0 ? 'UPDATE' : 'INSERT',
          message: `[DRY-RUN] Would set rich snippet type to '${snippetType}'`
        };
      }

      if (existing.length > 0) {
        await conn.execute(
          `UPDATE ${tablePrefix}postmeta SET meta_value = ? WHERE meta_id = ?`,
          [snippetType, existing[0].meta_id]
        );
      } else {
        await conn.execute(
          `INSERT INTO ${tablePrefix}postmeta (post_id, meta_key, meta_value) VALUES (?, ?, ?)`,
          [postId, metaKey, snippetType]
        );
      }

      return {
        success: true,
        action: existing.length > 0 ? 'UPDATE' : 'INSERT',
        message: `Set rich snippet type to '${snippetType}'`
      };
    },

    /**
     * Rollback to backed-up state (checks in-memory first, then file)
     */
    async rollback(postId) {
      let backup = backups.get(postId);
      if (!backup) {
        // Fall back to file-persisted backup
        backup = loadBackupFromFile(postId, config.host, config.database);
      }
      if (!backup) {
        return {
          success: false,
          error: `No backup found for post ID ${postId}`
        };
      }

      const conn = await getConnection();

      // Delete all current RankMath meta
      await conn.execute(
        `DELETE FROM ${tablePrefix}postmeta
         WHERE post_id = ? AND meta_key LIKE 'rank_math_schema_%'`,
        [postId]
      );

      // Restore backed-up meta
      for (const meta of backup.schemas) {
        if (meta.key.startsWith('rank_math_schema_')) {
          await conn.execute(
            `INSERT INTO ${tablePrefix}postmeta (post_id, meta_key, meta_value)
             VALUES (?, ?, ?)`,
            [postId, meta.key, meta.value]
          );
        }
      }

      return {
        success: true,
        postId,
        restored: backup.schemas.filter(m => m.key.startsWith('rank_math_schema_')).length,
        backupTimestamp: backup.timestamp,
        message: 'Rolled back to previous state'
      };
    },

    /**
     * List all available backups (in-memory + file-persisted)
     */
    listBackups() {
      const seen = new Set();
      const list = [];

      // In-memory backups first (most recent)
      for (const [postId, backup] of backups) {
        seen.add(String(postId));
        list.push({ postId, timestamp: backup.timestamp, schemaCount: backup.schemas.length });
      }

      // File-persisted backups
      const fileBackups = listPersistedBackups(config.host, config.database);
      for (const fb of fileBackups) {
        if (!seen.has(String(fb.postId))) {
          list.push(fb);
        }
      }

      return list;
    },

    /**
     * Delete a specific meta entry by ID
     * USE WITH CAUTION
     */
    async deleteMeta(metaId, options = {}) {
      const { dryRun = true } = options;

      const conn = await getConnection();

      // Get info about what we're deleting
      const [existing] = await conn.execute(
        `SELECT * FROM ${tablePrefix}postmeta WHERE meta_id = ?`,
        [metaId]
      );

      if (existing.length === 0) {
        return {
          success: false,
          error: `Meta ID ${metaId} not found`
        };
      }

      if (dryRun) {
        return {
          success: true,
          dryRun: true,
          metaId,
          postId: existing[0].post_id,
          metaKey: existing[0].meta_key,
          message: `[DRY-RUN] Would delete meta ID ${metaId} (${existing[0].meta_key})`
        };
      }

      await conn.execute(
        `DELETE FROM ${tablePrefix}postmeta WHERE meta_id = ?`,
        [metaId]
      );

      return {
        success: true,
        deleted: {
          metaId,
          postId: existing[0].post_id,
          metaKey: existing[0].meta_key
        },
        message: `Deleted meta ID ${metaId}`
      };
    },

    /**
     * Delete all schemas for a post
     */
    async deleteAllSchemas(postId, options = {}) {
      const { dryRun = true, backup = true } = options;

      const conn = await getConnection();

      // Get existing schemas
      const [existing] = await conn.execute(
        `SELECT meta_id, meta_key FROM ${tablePrefix}postmeta
         WHERE post_id = ? AND meta_key LIKE 'rank_math_schema_%'`,
        [postId]
      );

      if (dryRun) {
        return {
          success: true,
          dryRun: true,
          postId,
          schemasToDelete: existing.length,
          schemas: existing.map(e => e.meta_key),
          message: `[DRY-RUN] Would delete ${existing.length} schema(s)`
        };
      }

      // Backup first
      if (backup) {
        await this.backupMeta(postId);
      }

      await conn.execute(
        `DELETE FROM ${tablePrefix}postmeta
         WHERE post_id = ? AND meta_key LIKE 'rank_math_schema_%'`,
        [postId]
      );

      return {
        success: true,
        postId,
        deleted: existing.length,
        canRollback: backup,
        message: `Deleted ${existing.length} schema(s)`
      };
    },

    /**
     * Close the database connection
     */
    async close() {
      if (connection) {
        await connection.end();
        connection = null;
      }
    },

    // Export utility functions for external use
    utils: {
      phpSerialize,
      convertToRankMathFormat,
      extractSchemaType,
      SCHEMA_TYPES
    }
  };
}

/**
 * Create a connection-pooled database client for WordPress
 * Uses mysql.createPool() for connection reuse across requests.
 * Same interface as create() but connections are managed automatically.
 *
 * @param {object} config - Database configuration (same as create())
 * @returns {object} - Client methods (same interface as create())
 */
function createPool(config) {
  const rawPrefix = config.tablePrefix || 'wp_';
  const tablePrefix = rawPrefix.replace(/[^a-zA-Z0-9_]/g, '');
  if (tablePrefix !== rawPrefix) {
    console.warn(`Table prefix sanitized from "${rawPrefix}" to "${tablePrefix}"`);
  }

  const pool = mysql.createPool({
    host: config.host,
    user: config.user,
    password: config.password,
    database: config.database,
    port: config.port || 3306,
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0
  });

  const promisePool = pool.promise();

  // Backup storage for rollback capability
  const backups = new Map();

  /**
   * Execute a query using the pool
   */
  async function execute(sql, params) {
    return promisePool.execute(sql, params);
  }

  return {
    async testConnection() {
      try {
        const [rows] = await execute('SELECT 1 as test');
        const [tables] = await execute(
          `SHOW TABLES LIKE '${tablePrefix}postmeta'`
        );
        if (tables.length === 0) {
          throw new Error(`WordPress table ${tablePrefix}postmeta not found`);
        }
        return { success: true, message: 'Database connection successful', tablePrefix };
      } catch (error) {
        throw new Error(`Database connection failed: ${error.message}`);
      }
    },

    async getPostIdBySlug(slug) {
      const [rows] = await execute(
        `SELECT ID, post_title, post_type, post_status
         FROM ${tablePrefix}posts
         WHERE post_name = ? AND post_status = 'publish'`,
        [slug]
      );
      return rows.length === 0 ? null : rows[0];
    },

    async getExistingSchemas(postId) {
      const [rows] = await execute(
        `SELECT meta_id, meta_key, meta_value
         FROM ${tablePrefix}postmeta
         WHERE post_id = ? AND meta_key LIKE 'rank_math%'`,
        [postId]
      );
      return rows.map(row => ({
        metaId: row.meta_id,
        key: row.meta_key,
        value: row.meta_value
      }));
    },

    async previewInsertion(postId, schema, schemaType = null, options = {}) {
      const [posts] = await execute(
        `SELECT ID, post_title FROM ${tablePrefix}posts WHERE ID = ?`,
        [postId]
      );
      if (posts.length === 0) {
        return { success: false, error: `Post ID ${postId} not found` };
      }
      const detectedType = schemaType || extractSchemaType(schema);
      const metaKey = `rank_math_schema_${detectedType}`;
      const rankMathSchema = convertToRankMathFormat(schema, detectedType, options);
      const metaValue = phpSerialize(rankMathSchema);
      const [existing] = await execute(
        `SELECT meta_id, meta_value FROM ${tablePrefix}postmeta
         WHERE post_id = ? AND meta_key = ?`,
        [postId, metaKey]
      );
      return {
        success: true,
        dryRun: true,
        postId,
        postTitle: posts[0].post_title,
        schemaType: detectedType,
        metaKey,
        metaValueLength: metaValue.length,
        action: existing.length > 0 ? 'UPDATE' : 'INSERT',
        existingMetaId: existing.length > 0 ? existing[0].meta_id : null,
        existingValueLength: existing.length > 0 ? existing[0].meta_value?.length : 0,
        message: existing.length > 0
          ? `Would UPDATE existing meta (ID: ${existing[0].meta_id})`
          : `Would INSERT new meta row`
      };
    },

    async backupMeta(postId) {
      const existing = await this.getExistingSchemas(postId);
      backups.set(postId, {
        timestamp: new Date().toISOString(),
        schemas: existing
      });
      saveBackupsToFile(backups, config.host, config.database);
      return { success: true, postId, backedUp: existing.length, backupId: postId };
    },

    async insertSchema(postId, schema, schemaType = null, options = {}) {
      const { dryRun = true, backup = true, isPrimary = false } = options;
      const detectedType = schemaType || extractSchemaType(schema);
      const preview = await this.previewInsertion(postId, schema, detectedType, { isPrimary });
      if (!preview.success) return preview;
      if (dryRun) {
        return { ...preview, message: '[DRY-RUN] ' + preview.message + ' - Pass { dryRun: false } to execute' };
      }
      const metaKey = `rank_math_schema_${detectedType}`;
      const rankMathSchema = convertToRankMathFormat(schema, detectedType, { isPrimary });
      const metaValue = phpSerialize(rankMathSchema);
      if (backup) await this.backupMeta(postId);
      try {
        if (preview.action === 'UPDATE') {
          await execute(
            `UPDATE ${tablePrefix}postmeta SET meta_value = ? WHERE post_id = ? AND meta_key = ?`,
            [metaValue, postId, metaKey]
          );
          return {
            success: true, action: 'UPDATE', postId, metaKey, schemaType: detectedType,
            metaId: preview.existingMetaId,
            message: `Updated existing ${detectedType} schema (meta ID: ${preview.existingMetaId})`,
            canRollback: backup
          };
        } else {
          const [result] = await execute(
            `INSERT INTO ${tablePrefix}postmeta (post_id, meta_key, meta_value) VALUES (?, ?, ?)`,
            [postId, metaKey, metaValue]
          );
          return {
            success: true, action: 'INSERT', postId, metaKey, schemaType: detectedType,
            metaId: result.insertId,
            message: `Inserted new ${detectedType} schema (meta ID: ${result.insertId})`,
            canRollback: backup
          };
        }
      } catch (error) {
        return { success: false, error: error.message, canRollback: backup };
      }
    },

    async insertMultipleSchemas(postId, schemas, options = {}) {
      const { dryRun = true, backup = true } = options;
      const results = [];
      if (backup && !dryRun) await this.backupMeta(postId);
      for (let i = 0; i < schemas.length; i++) {
        const { schema, type } = schemas[i];
        const isPrimary = i === 0;
        const result = await this.insertSchema(postId, schema, type, { dryRun, backup: false, isPrimary });
        results.push(result);
      }
      return { success: results.every(r => r.success), results, canRollback: backup && !dryRun };
    },

    async insertFromGraph(postId, graphSchema, options = {}) {
      const { dryRun = true, backup = true, primaryType = null } = options;
      if (!graphSchema['@graph'] || !Array.isArray(graphSchema['@graph'])) {
        return { success: false, error: 'Schema does not contain @graph array' };
      }
      const schemas = [];
      let primaryIndex = 0;
      graphSchema['@graph'].forEach((item, index) => {
        const type = extractSchemaType(item);
        if (['WebSite', 'Organization', 'Place', 'ImageObject'].includes(type)) {
          if (Object.keys(item).length <= 3) return;
        }
        schemas.push({ schema: item, type });
        if (primaryType && type === primaryType) {
          primaryIndex = schemas.length - 1;
        } else if (!primaryType && (type === 'Service' || type === 'Article' || type === 'Product')) {
          primaryIndex = schemas.length - 1;
        }
      });
      if (primaryIndex > 0) {
        const primary = schemas.splice(primaryIndex, 1)[0];
        schemas.unshift(primary);
      }
      return this.insertMultipleSchemas(postId, schemas, { dryRun, backup });
    },

    async setRichSnippetType(postId, snippetType, options = {}) {
      const { dryRun = true } = options;
      const metaKey = 'rank_math_rich_snippet';
      const [existing] = await execute(
        `SELECT meta_id, meta_value FROM ${tablePrefix}postmeta WHERE post_id = ? AND meta_key = ?`,
        [postId, metaKey]
      );
      if (dryRun) {
        return {
          success: true, dryRun: true, postId, metaKey, newValue: snippetType,
          action: existing.length > 0 ? 'UPDATE' : 'INSERT',
          message: `[DRY-RUN] Would set rich snippet type to '${snippetType}'`
        };
      }
      if (existing.length > 0) {
        await execute(`UPDATE ${tablePrefix}postmeta SET meta_value = ? WHERE meta_id = ?`, [snippetType, existing[0].meta_id]);
      } else {
        await execute(`INSERT INTO ${tablePrefix}postmeta (post_id, meta_key, meta_value) VALUES (?, ?, ?)`, [postId, metaKey, snippetType]);
      }
      return { success: true, action: existing.length > 0 ? 'UPDATE' : 'INSERT', message: `Set rich snippet type to '${snippetType}'` };
    },

    async rollback(postId) {
      let backup = backups.get(postId);
      if (!backup) {
        backup = loadBackupFromFile(postId, config.host, config.database);
      }
      if (!backup) {
        return { success: false, error: `No backup found for post ID ${postId}` };
      }
      await execute(
        `DELETE FROM ${tablePrefix}postmeta WHERE post_id = ? AND meta_key LIKE 'rank_math_schema_%'`,
        [postId]
      );
      for (const meta of backup.schemas) {
        if (meta.key.startsWith('rank_math_schema_')) {
          await execute(
            `INSERT INTO ${tablePrefix}postmeta (post_id, meta_key, meta_value) VALUES (?, ?, ?)`,
            [postId, meta.key, meta.value]
          );
        }
      }
      return {
        success: true, postId,
        restored: backup.schemas.filter(m => m.key.startsWith('rank_math_schema_')).length,
        backupTimestamp: backup.timestamp,
        message: 'Rolled back to previous state'
      };
    },

    listBackups() {
      const seen = new Set();
      const list = [];
      for (const [postId, backup] of backups) {
        seen.add(String(postId));
        list.push({ postId, timestamp: backup.timestamp, schemaCount: backup.schemas.length });
      }
      const fileBackups = listPersistedBackups(config.host, config.database);
      for (const fb of fileBackups) {
        if (!seen.has(String(fb.postId))) list.push(fb);
      }
      return list;
    },

    async deleteMeta(metaId, options = {}) {
      const { dryRun = true } = options;
      const [existing] = await execute(
        `SELECT * FROM ${tablePrefix}postmeta WHERE meta_id = ?`,
        [metaId]
      );
      if (existing.length === 0) {
        return { success: false, error: `Meta ID ${metaId} not found` };
      }
      if (dryRun) {
        return {
          success: true, dryRun: true, metaId, postId: existing[0].post_id,
          metaKey: existing[0].meta_key,
          message: `[DRY-RUN] Would delete meta ID ${metaId} (${existing[0].meta_key})`
        };
      }
      await execute(`DELETE FROM ${tablePrefix}postmeta WHERE meta_id = ?`, [metaId]);
      return {
        success: true,
        deleted: { metaId, postId: existing[0].post_id, metaKey: existing[0].meta_key },
        message: `Deleted meta ID ${metaId}`
      };
    },

    async deleteAllSchemas(postId, options = {}) {
      const { dryRun = true, backup = true } = options;
      const [existing] = await execute(
        `SELECT meta_id, meta_key FROM ${tablePrefix}postmeta WHERE post_id = ? AND meta_key LIKE 'rank_math_schema_%'`,
        [postId]
      );
      if (dryRun) {
        return {
          success: true, dryRun: true, postId, schemasToDelete: existing.length,
          schemas: existing.map(e => e.meta_key),
          message: `[DRY-RUN] Would delete ${existing.length} schema(s)`
        };
      }
      if (backup) await this.backupMeta(postId);
      await execute(
        `DELETE FROM ${tablePrefix}postmeta WHERE post_id = ? AND meta_key LIKE 'rank_math_schema_%'`,
        [postId]
      );
      return { success: true, postId, deleted: existing.length, canRollback: backup, message: `Deleted ${existing.length} schema(s)` };
    },

    async close() {
      await pool.end();
    },

    utils: {
      phpSerialize,
      convertToRankMathFormat,
      extractSchemaType,
      SCHEMA_TYPES
    }
  };
}

module.exports = {
  create,
  createPool,
  // Also export utilities at module level
  phpSerialize,
  convertToRankMathFormat,
  extractSchemaType,
  SCHEMA_TYPES
};
