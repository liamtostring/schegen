#!/usr/bin/env node
/**
 * Database Connection Test Script
 *
 * Tests direct MySQL connection to WordPress database for RankMath schema injection.
 *
 * Usage:
 *   node scripts/test-db-connection.js
 *   node scripts/test-db-connection.js --slug "my-page-slug"
 *   node scripts/test-db-connection.js --post-id 123
 *   node scripts/test-db-connection.js --post-id 123 --preview
 *   node scripts/test-db-connection.js --post-id 123 --insert --dry-run
 *
 * Environment variables (in .env):
 *   DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT, DB_TABLE_PREFIX
 */

require('dotenv').config();
const databaseClient = require('../src/services/databaseClient');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  slug: null,
  postId: null,
  preview: false,
  insert: false,
  dryRun: true,
  rollback: false
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--slug':
      options.slug = args[++i];
      break;
    case '--post-id':
      options.postId = parseInt(args[++i]);
      break;
    case '--preview':
      options.preview = true;
      break;
    case '--insert':
      options.insert = true;
      break;
    case '--dry-run':
      options.dryRun = true;
      break;
    case '--execute':
      options.dryRun = false;
      break;
    case '--rollback':
      options.rollback = true;
      break;
    case '--help':
      printHelp();
      process.exit(0);
  }
}

function printHelp() {
  console.log(`
Database Connection Test Script
================================

Usage:
  node scripts/test-db-connection.js [options]

Options:
  --slug <slug>     Find post by URL slug
  --post-id <id>    Use specific post ID
  --preview         Preview existing RankMath schemas for post
  --insert          Test schema insertion (dry-run by default)
  --dry-run         Preview changes without making them (default)
  --execute         Actually make changes (USE WITH CAUTION)
  --rollback        Rollback last insertion for post
  --help            Show this help message

Examples:
  # Test database connection
  node scripts/test-db-connection.js

  # Find a post by slug
  node scripts/test-db-connection.js --slug "ac-repair-houston"

  # View existing schemas for a post
  node scripts/test-db-connection.js --post-id 123 --preview

  # Test insert (dry-run, no changes)
  node scripts/test-db-connection.js --post-id 123 --insert

  # Actually insert (BE CAREFUL)
  node scripts/test-db-connection.js --post-id 123 --insert --execute

Environment Variables (set in .env):
  DB_HOST          Database host (default: localhost)
  DB_USER          Database username
  DB_PASSWORD      Database password
  DB_NAME          WordPress database name
  DB_PORT          Database port (default: 3306)
  DB_TABLE_PREFIX  WordPress table prefix (default: wp_)
`);
}

async function main() {
  console.log('\n=== RankMath Database Connection Test ===\n');

  // Check for required environment variables
  const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT) || 3306,
    tablePrefix: process.env.DB_TABLE_PREFIX || 'wp_'
  };

  if (!config.user || !config.password || !config.database) {
    console.error('ERROR: Missing database credentials in .env file');
    console.error('Required: DB_USER, DB_PASSWORD, DB_NAME');
    console.error('\nAdd these to your .env file:');
    console.error('  DB_HOST=localhost');
    console.error('  DB_USER=your_db_user');
    console.error('  DB_PASSWORD=your_db_password');
    console.error('  DB_NAME=your_wordpress_db');
    process.exit(1);
  }

  console.log('Database Config:');
  console.log(`  Host: ${config.host}:${config.port}`);
  console.log(`  Database: ${config.database}`);
  console.log(`  User: ${config.user}`);
  console.log(`  Table Prefix: ${config.tablePrefix}`);
  console.log('');

  let client;
  try {
    // Create database client
    client = await databaseClient.create(config);

    // Test connection
    console.log('Testing connection...');
    const connResult = await client.testConnection();
    console.log(`  ✓ ${connResult.message}`);
    console.log(`  Table prefix: ${connResult.tablePrefix}`);
    console.log('');

    // Find post by slug if provided
    if (options.slug) {
      console.log(`Looking up post by slug: "${options.slug}"...`);
      const post = await client.getPostIdBySlug(options.slug);
      if (post) {
        console.log(`  ✓ Found post:`);
        console.log(`    ID: ${post.ID}`);
        console.log(`    Title: ${post.post_title}`);
        console.log(`    Type: ${post.post_type}`);
        console.log(`    Status: ${post.post_status}`);
        options.postId = post.ID;
      } else {
        console.log(`  ✗ No post found with slug "${options.slug}"`);
      }
      console.log('');
    }

    // Get existing schemas if post ID provided
    if (options.postId && (options.preview || options.insert)) {
      console.log(`Getting existing RankMath schemas for post ID ${options.postId}...`);
      const schemas = await client.getExistingSchemas(options.postId);

      if (schemas.length === 0) {
        console.log('  No existing RankMath schemas found');
      } else {
        console.log(`  Found ${schemas.length} schema meta entries:`);
        schemas.forEach(s => {
          console.log(`    - ${s.key} (meta_id: ${s.metaId})`);
          // Show first 100 chars of value
          const preview = s.value?.substring(0, 100);
          if (preview) {
            console.log(`      Value: ${preview}${s.value.length > 100 ? '...' : ''}`);
          }
        });
      }
      console.log('');
    }

    // Test insertion if requested
    if (options.postId && options.insert) {
      const testSchema = {
        '@context': 'https://schema.org',
        '@type': 'Service',
        'name': 'Test Service Schema',
        'description': 'This is a test schema for database insertion',
        'provider': {
          '@type': 'LocalBusiness',
          'name': 'Test Business'
        }
      };

      console.log(`Testing schema insertion for post ID ${options.postId}...`);
      console.log(`  Mode: ${options.dryRun ? 'DRY-RUN (no changes)' : 'EXECUTE (will make changes!)'}`);
      console.log('');

      // Preview first
      console.log('Previewing insertion...');
      const preview = await client.previewInsertion(options.postId, testSchema, 'Service');
      console.log(`  Post: ${preview.postTitle}`);
      console.log(`  Meta Key: ${preview.metaKey}`);
      console.log(`  Action: ${preview.action}`);
      if (preview.existingMetaId) {
        console.log(`  Existing Meta ID: ${preview.existingMetaId}`);
      }
      console.log(`  Schema size: ${preview.metaValueLength} bytes`);
      console.log('');

      // Execute if not dry-run
      if (!options.dryRun) {
        console.log('EXECUTING insertion...');
        const result = await client.insertSchema(options.postId, testSchema, 'Service', {
          dryRun: false,
          backup: true
        });
        console.log(`  ✓ ${result.message}`);
        if (result.metaId) {
          console.log(`  New meta ID: ${result.metaId}`);
        }
        console.log(`  Rollback available: ${result.canRollback}`);
        console.log('');

        // Verify insertion
        console.log('Verifying insertion...');
        const newSchemas = await client.getExistingSchemas(options.postId);
        const inserted = newSchemas.find(s => s.key === `rank_math_schema_Service`);
        if (inserted) {
          console.log('  ✓ Schema successfully inserted');
        } else {
          console.log('  ✗ Schema not found after insertion');
        }
      } else {
        console.log('[DRY-RUN] No changes made. Use --execute to actually insert.');
      }
      console.log('');
    }

    // Rollback if requested
    if (options.postId && options.rollback) {
      console.log(`Rolling back changes for post ID ${options.postId}...`);
      const result = await client.rollback(options.postId);
      if (result.success) {
        console.log(`  ✓ ${result.message}`);
        console.log(`  Restored ${result.restored} schema entries`);
      } else {
        console.log(`  ✗ ${result.error}`);
      }
      console.log('');
    }

    console.log('=== Test Complete ===\n');

  } catch (error) {
    console.error(`\nERROR: ${error.message}\n`);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

main();
