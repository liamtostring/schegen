# Schema Generator - Development Documentation

> **Last Updated:** February 2, 2026
> **Version:** 2.8.0 (AI-Powered Schema Generation with Auto-Verification)

---

## Table of Contents

1. [Application Overview](#application-overview)
2. [Architecture](#architecture)
3. [Latest Changes (v2.6.0)](#latest-changes-v260)
4. [File Structure](#file-structure)
5. [Key Components](#key-components)
6. [API Endpoints](#api-endpoints)
7. [Database Schema Storage](#database-schema-storage)
8. [Development Setup](#development-setup)
9. [Testing](#testing)
10. [Known Issues & TODOs](#known-issues--todos)
11. [Continuing Development](#continuing-development)

---

## Application Overview

### What It Does

The **Schema Generator** is a Node.js/Express web application that automatically generates JSON-LD structured data schemas for WordPress websites, specifically optimized for:

- **HVAC & Home Services businesses**
- **RankMath SEO plugin** integration
- **Google Rich Results** compliance

### Core Features

| Feature | Description |
|---------|-------------|
| **Schema Generation** | Creates JSON-LD `@graph` structures with Service, LocalBusiness, FAQPage, BreadcrumbList, Article, and WebPage schemas |
| **Page Type Detection** | Auto-detects if a URL is a service page, location page, or blog article |
| **FAQ Extraction** | Scrapes FAQ content from pages and generates FAQPage schema |
| **Organization Detection** | Auto-detects business name, phone, logo, address, and service areas from website |
| **WordPress Integration** | Inserts schemas via REST API or Direct Database injection |
| **RankMath Compatibility** | Stores schemas in RankMath's expected `wp_postmeta` format |
| **AI Verification** | Optional OpenAI/Gemini verification for accuracy and Google compliance |
| **Bulk Processing** | Process entire sitemaps at once |

### How It Works

```
1. User provides URL(s) →
2. App scrapes page content →
3. Detects page type (service/location/article) →
4. Extracts FAQs, contact info, etc. →
5. Generates JSON-LD schema with @graph structure →
6. Validates against Google Rich Results requirements →
7. Inserts into WordPress via REST API or Direct DB
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Browser)                       │
│  - EJS Templates (src/views/)                               │
│  - Vanilla JS (public/js/app.js)                            │
│  - CSS (public/css/style.css)                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Express.js Server                          │
│  - src/index.js (entry point)                               │
│  - src/routes/api.js (REST endpoints)                       │
│  - src/routes/index.js (UI routes)                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Services Layer                          │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ schemaGenerator │  │   pageScraper   │                   │
│  │ (orchestrator)  │  │ (HTML parsing)  │                   │
│  └─────────────────┘  └─────────────────┘                   │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ wordpressClient │  │ databaseClient  │  ← NEW            │
│  │  (REST API)     │  │ (Direct MySQL)  │                   │
│  └─────────────────┘  └─────────────────┘                   │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ pageTypeDetector│  │  sitemapParser  │                   │
│  └─────────────────┘  └─────────────────┘                   │
│  ┌─────────────────────────────────────────┐                │
│  │           AI Services (optional)         │                │
│  │  - OpenAI (GPT-4)                        │                │
│  │  - Google Gemini                         │                │
│  └─────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    External Services                         │
│  - WordPress REST API (/wp-json/wp/v2)                      │
│  - WordPress MySQL Database (wp_postmeta)  ← NEW            │
│  - Target websites (for scraping)                           │
│  - OpenAI API / Gemini API (optional)                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Latest Changes (v2.8.0)

### AI-Powered Schema Generation with Auto-Verification

**Session Date:** February 2, 2026

#### New Workflow
```
1. Crawl URL → scrape page content
2. AI analyzes content → decides which schemas apply
3. Generate schemas from ACTUAL content (FAQs extracted, not invented)
4. AI verifies → logic, coherence, truthfulness, Google compliance
5. Return canPublish status → user reviews before publishing
```

#### Key Fixes & Improvements

| Fix | Description |
|-----|-------------|
| **Gemini Model Update** | Updated to `gemini-2.0-flash` (old models deprecated) |
| **Elementor FAQ Extraction** | Added support for `details.e-n-accordion-item` nested accordions |
| **Regex Bug Fix** | Fixed `split()` error caused by global flag in service area regex |
| **Canadian Address** | Default country now "CA", detects ON/BC/AB provinces |
| **AI Schema Generator** | Now generates ALL appropriate schemas (Service, FAQPage, HVACBusiness, BreadcrumbList, WebPage) |
| **Auto-Verification** | AI verification runs automatically after generation |

#### API Endpoint: `/api/ai/generate-schema`

```bash
# Generate schemas with AI + auto-verification
curl -X POST http://localhost:3000/api/ai/generate-schema \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/service-page/",
    "provider": "gemini",
    "orgInfo": {
      "name": "Business Name",
      "businessType": "HVACBusiness",
      "phone": "905-123-4567",
      "address": {
        "streetAddress": "123 Main St",
        "addressLocality": "Hamilton",
        "addressRegion": "ON",
        "postalCode": "L8E 5M8",
        "addressCountry": "CA"
      }
    }
  }'
```

#### Response includes:
- `schemas[]` - All generated schemas (Service, FAQPage, HVACBusiness, etc.)
- `verification.googleCompliant` - true/false
- `verification.dataAccuracy` - checks business name, address, phone, FAQs
- `verification.canPublish` - ready to insert or needs fixes

#### Schema Types Generated by Page Type

| Page Type | Schemas Generated |
|-----------|-------------------|
| **Service** | Service, HVACBusiness, FAQPage*, BreadcrumbList, WebPage |
| **Location** | HVACBusiness, BreadcrumbList, WebPage |
| **Article** | Article, HVACBusiness, BreadcrumbList, WebPage |

*FAQPage only included if FAQs found on page (never invented)

#### Environment Setup

```bash
# .env file
GEMINI_API_KEY=your-gemini-api-key
# OR
OPENAI_API_KEY=your-openai-api-key
```

#### Running the App

```bash
cd schema-generator
npm install
npm start
# Open http://localhost:3000
```

---

## Previous Changes (v2.7.0)

### RankMath Native Format Support

**Problem Solved:** RankMath stores schemas as **PHP serialized arrays**, not JSON-LD. The previous version stored raw JSON which caused JavaScript errors in the WordPress admin (`Cannot read properties of undefined (reading 'isPrimary')`).

### Key Discovery: RankMath Internal Format

RankMath stores schemas in `wp_postmeta` with this structure:

```php
// Meta key format
rank_math_schema_{SchemaType}  // e.g., rank_math_schema_Service

// Meta value is a PHP serialized array:
array(
    'metadata' => array(
        'title' => 'Service',
        'type' => 'custom',
        'shortcode' => 's-xxxxx',      // For primary schemas
        'isPrimary' => '1',             // '1' for primary, '0' for secondary
        'name' => '%seo_title%',
        'description' => '%seo_description%',
        'reviewLocationShortcode' => '[rank_math_rich_snippet]'
    ),
    '@type' => 'Service',
    'name' => 'Service Name',
    // ... rest of schema fields
)
```

### New Features in databaseClient.js

| Function | Description |
|----------|-------------|
| `phpSerialize()` | Converts JS objects to PHP serialize() format |
| `convertToRankMathFormat()` | Wraps JSON-LD with RankMath metadata |
| `extractSchemaType()` | Auto-detects schema type from @type |
| `insertMultipleSchemas()` | Insert Service + FAQPage together |
| `insertFromGraph()` | Split @graph into individual schemas |
| `deleteAllSchemas()` | Remove all schemas from a post |

### Supported Schema Types

```javascript
const SCHEMA_TYPES = {
  // Business (can be primary)
  Service, LocalBusiness, Organization,

  // Content (can be primary)
  Article, NewsArticle, BlogPosting,

  // Pages
  FAQPage, HowTo,

  // Commerce
  Product, Offer,

  // Other primary types
  Event, Person, Recipe, VideoObject, Course,
  JobPosting, SoftwareApplication, Book,

  // Secondary types (cannot be primary)
  Review, AggregateRating, Place, BreadcrumbList, WebPage
};
```

### Usage Example

```javascript
const databaseClient = require('./services/databaseClient');

const client = await databaseClient.create({
  host: 'localhost',
  user: 'wp_user',
  password: 'password',
  database: 'wordpress'
});

// Insert a Service schema (as primary)
await client.insertSchema(postId, serviceSchema, 'Service', {
  dryRun: false,
  isPrimary: true
});

// Insert FAQPage (as secondary)
await client.insertSchema(postId, faqSchema, 'FAQPage', {
  dryRun: false,
  isPrimary: false
});

// Or insert multiple at once
await client.insertMultipleSchemas(postId, [
  { schema: serviceSchema, type: 'Service' },
  { schema: faqSchema, type: 'FAQPage' }
], { dryRun: false });
```

---

## Previous Changes (v2.6.0)

### Direct Database Injection for RankMath

**Problem Solved:** REST API insertion doesn't always work reliably with RankMath's schema storage. Direct database access provides more reliable schema injection.

### New Files Created

| File | Purpose |
|------|---------|
| `src/services/databaseClient.js` | MySQL client with safe insertion, backup, and rollback |
| `scripts/test-db-connection.js` | CLI tool for testing database operations |

### Modified Files

| File | Changes |
|------|---------|
| `src/routes/api.js` | Added 9 new `/api/db/*` endpoints |
| `src/views/index.ejs` | Added "Direct Database" tab in UI |
| `public/js/app.js` | Added database UI functionality |
| `public/css/style.css` | Added database UI styles |
| `.env.example` | Added `DB_*` environment variables |
| `package.json` | Added `mysql2` dependency, `test:db` script |

### API Endpoints (RankMath Helper Plugin) - RECOMMENDED

Works with any WordPress site that has the helper snippet installed.
No direct database access needed - uses WordPress REST API.

```
POST /api/rankmath/test-connection      - Test connection to helper plugin
POST /api/rankmath/find-post            - Find post by slug or URL
POST /api/rankmath/get-schemas          - Get existing RankMath schemas
POST /api/rankmath/page-info            - Get post info + existing schemas
POST /api/rankmath/insert-schema        - Insert single schema
POST /api/rankmath/insert-multiple      - Insert multiple schemas (Service + FAQPage)
POST /api/rankmath/insert-by-url        - Find post by URL and insert
POST /api/rankmath/insert-multiple-by-url - Insert multiple by URL
POST /api/rankmath/delete-schemas       - Delete schemas (all or by type)
POST /api/rankmath/generate-and-insert  - Full workflow: scrape, generate, insert
GET  /api/rankmath/schema-types         - List supported schema types
```

**Required parameters for all /api/rankmath/* endpoints:**
- `siteUrl` - WordPress site URL (e.g., https://example.com)
- `secretToken` - The token configured in the helper snippet

### API Endpoints (Direct Database) - For Local/Direct MySQL Access

```
POST /api/db/test-connection        - Test MySQL connection
POST /api/db/get-post               - Find post by slug
POST /api/db/get-schemas            - Get existing RankMath schemas
POST /api/db/preview-insertion      - Dry-run preview
POST /api/db/insert-schema          - Insert single schema (with isPrimary option)
POST /api/db/insert-multiple-schemas - Insert multiple schemas (Service + FAQPage)
POST /api/db/insert-from-graph      - Split @graph into individual schemas
POST /api/db/insert-by-url          - Find post by URL and insert
POST /api/db/set-rich-snippet       - Set rank_math_rich_snippet meta
POST /api/db/delete-all-schemas     - Delete all schemas from a post
POST /api/db/rollback               - Restore previous state
POST /api/db/delete-meta            - Delete specific meta entry
GET  /api/db/schema-types           - List supported schema types
```

### Safety Features Implemented

1. **Dry-run mode (default)** - All write operations preview changes first
2. **Automatic backup** - Stores existing meta in memory before modification
3. **Rollback capability** - Can restore previous state after insertion
4. **Confirmation required** - UI requires explicit confirmation for writes

### New Environment Variables

```env
# Direct Database Connection
DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_wordpress_db
DB_PORT=3306
DB_TABLE_PREFIX=wp_
```

---

## File Structure

```
schema-generator/
├── src/
│   ├── index.js                      # Express app entry point
│   ├── routes/
│   │   ├── index.js                  # UI routes (renders EJS)
│   │   └── api.js                    # REST API endpoints (646+ lines)
│   ├── schemas/                      # Schema generators (one per type)
│   │   ├── article.js                # Article/BlogPosting schema
│   │   ├── breadcrumb.js             # BreadcrumbList schema
│   │   ├── faq.js                    # FAQPage schema
│   │   ├── localBusiness.js          # HVACBusiness/LocalBusiness
│   │   ├── location.js               # Location pages (multi-schema)
│   │   └── service.js                # Service schema (HVAC-optimized)
│   ├── services/
│   │   ├── schemaGenerator.js        # Main orchestrator
│   │   ├── pageScraper.js            # HTML scraping & data extraction
│   │   ├── pageTypeDetector.js       # Service vs Article detection
│   │   ├── sitemapParser.js          # XML sitemap parsing
│   │   ├── wordpressClient.js        # WordPress REST API client
│   │   ├── databaseClient.js         # ← NEW: Direct MySQL client
│   │   └── ai/
│   │       ├── index.js              # AI provider abstraction
│   │       ├── verifier.js           # Verification prompts
│   │       └── providers/
│   │           ├── openai.js         # OpenAI GPT integration
│   │           └── gemini.js         # Google Gemini integration
│   └── views/
│       ├── index.ejs                 # Main dashboard
│       └── partials/
│           └── header.ejs            # Header partial
├── public/
│   ├── css/style.css                 # All styles (~1400 lines)
│   └── js/app.js                     # Frontend JS (~2200 lines)
├── scripts/
│   └── test-db-connection.js         # ← NEW: CLI test script
├── tests/
│   └── schemaGenerator.test.js       # 36 test cases
├── .env.example                      # Environment template
├── package.json
├── README.md
├── CHANGELOG.md
└── DEVELOPMENT.md                    # ← THIS FILE
```

---

## Key Components

### 1. Schema Generator (`src/services/schemaGenerator.js`)

The main orchestrator that:
- Determines which schemas to include based on page type
- Combines multiple schemas into an `@graph` structure
- Validates the final output

```javascript
// Example output structure
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Service", ... },
    { "@type": "LocalBusiness", ... },
    { "@type": "FAQPage", ... },
    { "@type": "BreadcrumbList", ... },
    { "@type": "WebPage", ... }
  ]
}
```

### 2. WordPress Client (`src/services/wordpressClient.js`)

Handles REST API communication:
- Tests connection via `/wp-json/wp/v2/users/me`
- Finds posts/pages by URL slug
- Updates post meta for RankMath schemas
- Falls back to content injection if meta fails

### 3. Database Client (`src/services/databaseClient.js`) - NEW

Direct MySQL access for reliable schema injection:

```javascript
const client = await databaseClient.create({
  host: 'localhost',
  user: 'wp_user',
  password: 'password',
  database: 'wordpress',
  tablePrefix: 'wp_'
});

// Safe preview (no changes)
const preview = await client.previewInsertion(postId, schema, 'Service');

// Execute with backup
const result = await client.insertSchema(postId, schema, 'Service', {
  dryRun: false,
  backup: true
});

// Rollback if needed
await client.rollback(postId);
```

### 4. Page Scraper (`src/services/pageScraper.js`)

Extracts data from web pages:
- Title, description, featured image
- FAQs (looks for FAQ sections, accordion elements, Q&A patterns)
- Phone numbers (regex patterns)
- Service areas (location mentions)
- Existing JSON-LD schemas

### 5. AI Verifier (`src/services/ai/verifier.js`)

Optional AI-powered verification:
- Validates page type detection
- Checks business info accuracy
- Finds missed FAQs
- Extracts reviews/testimonials
- Verifies Google Rich Results compliance

---

## API Endpoints

### REST API Method (Original)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/test-connection` | POST | Test WordPress REST API connection |
| `/api/generate-schema` | POST | Generate schema for a URL |
| `/api/insert-schema` | POST | Insert via REST API |
| `/api/scrape-sitemap` | POST | Parse XML sitemap |
| `/api/bulk-process` | POST | Process entire sitemap |
| `/api/verify-insertion` | POST | Check if schema exists on page |

### Direct Database Method (NEW)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/db/test-connection` | POST | Test MySQL connection |
| `/api/db/get-post` | POST | Find post by slug |
| `/api/db/get-schemas` | POST | Get existing RankMath schemas |
| `/api/db/preview-insertion` | POST | Preview changes (dry-run) |
| `/api/db/insert-schema` | POST | Insert with `dryRun` flag |
| `/api/db/insert-by-url` | POST | Find by URL and insert |
| `/api/db/rollback` | POST | Restore previous state |
| `/api/db/delete-meta` | POST | Delete specific meta |

---

## Database Schema Storage

### Where RankMath Stores Schemas

RankMath stores schemas in the **`wp_postmeta`** table:

```sql
SELECT * FROM wp_postmeta
WHERE post_id = 123
AND meta_key LIKE 'rank_math%';
```

### Key Meta Keys

| Meta Key | Purpose |
|----------|---------|
| `rank_math_schema_Service` | Service schema JSON |
| `rank_math_schema_Article` | Article schema JSON |
| `rank_math_schema_LocalBusiness` | Business schema JSON |
| `rank_math_schema_FAQPage` | FAQ schema JSON |
| `rank_math_schema_Service_LocalBusiness_FAQPage` | Combined schema types |
| `rank_math_rich_snippet` | Page type (`article`, `service`, etc.) |

### Schema Storage Format

```sql
INSERT INTO wp_postmeta (post_id, meta_key, meta_value)
VALUES (
  123,
  'rank_math_schema_Service',
  '{"@context":"https://schema.org","@type":"Service",...}'
);
```

---

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- npm
- MySQL/MariaDB access (for direct DB features)
- WordPress site with RankMath (for testing)

### Installation

```bash
cd schema-generator
npm install
cp .env.example .env
# Edit .env with your settings
npm run dev
```

### Environment Variables

```env
# Server
PORT=3000

# WordPress REST API (optional)
WP_SITE_URL=https://example.com
WP_USERNAME=admin
WP_APP_PASSWORD=xxxx xxxx xxxx xxxx

# Direct Database (for reliable schema injection)
DB_HOST=localhost
DB_USER=wp_user
DB_PASSWORD=your_password
DB_NAME=wordpress_db
DB_PORT=3306
DB_TABLE_PREFIX=wp_

# Organization Defaults
DEFAULT_ORG_NAME=Your Business
DEFAULT_BUSINESS_TYPE=HVACBusiness
DEFAULT_AREA_SERVED=Houston, Dallas, Austin
DEFAULT_PHONE=(555) 123-4567

# AI (optional)
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
```

---

## Testing

### Run Unit Tests

```bash
npm test
```

### Test Database Connection (CLI)

```bash
# Show help
npm run test:db:help

# Test connection
npm run test:db

# Find post and view schemas
npm run test:db -- --slug "ac-repair" --preview

# Test insertion (dry-run)
npm run test:db -- --post-id 123 --insert

# Actually insert
npm run test:db -- --post-id 123 --insert --execute
```

### Manual Testing Workflow

1. Start the app: `npm run dev`
2. Open http://localhost:3000
3. Test REST API connection (WordPress Credentials tab)
4. Test Direct Database connection (Direct Database tab)
5. Generate a schema for a test URL
6. Preview insertion (dry-run)
7. Execute insertion
8. Verify in WordPress admin (RankMath Schema tab)

---

## Known Issues & TODOs

### Known Issues

1. **REST API meta insertion** may not work with all RankMath configurations (hence the direct DB feature)
2. **Rollback only works within same session** - backup is stored in memory, not persisted
3. **No connection pooling** for database - creates new connection per request

### Potential Improvements

- [ ] Persist backups to file/database for cross-session rollback
- [ ] Add database connection pooling
- [ ] Add bulk database insertion endpoint
- [ ] Add schema diff view (compare before/after)
- [ ] Add scheduled/automated schema updates
- [ ] Add webhook support for schema changes
- [ ] Support for other SEO plugins (Yoast, SEOPress)

---

## Continuing Development

### To Pick Up Where I Left Off

1. **Read this file** for context
2. **Check `src/services/databaseClient.js`** - the new database client
3. **Check `src/routes/api.js`** - search for `/api/db/` to find new endpoints (around line 645+)
4. **Check `public/js/app.js`** - search for "Direct Database Functions" (around line 1920+)

### Next Steps I Would Suggest

1. **Test thoroughly** with a real WordPress/RankMath installation
2. **Add persistent backups** - currently backups are in-memory only
3. **Add connection pooling** for better performance
4. **Add bulk DB insertion** - process multiple posts via database
5. **Add UI for selecting insertion method** - let user choose REST vs DB per-schema

### Key Files to Understand

| Priority | File | Why |
|----------|------|-----|
| 1 | `src/services/databaseClient.js` | Core database logic |
| 2 | `src/routes/api.js` | All API endpoints |
| 3 | `public/js/app.js` | Frontend logic |
| 4 | `src/services/schemaGenerator.js` | Schema generation logic |
| 5 | `src/services/wordpressClient.js` | REST API alternative |

### How to Add New Features

**Adding a new schema type:**
1. Create `src/schemas/newType.js`
2. Add to `schemaGenerator.js` orchestrator
3. Update page type detection if needed

**Adding a new API endpoint:**
1. Add route in `src/routes/api.js`
2. Add frontend call in `public/js/app.js`
3. Add UI controls in `src/views/index.ejs`

**Modifying database operations:**
1. Edit `src/services/databaseClient.js`
2. Add/modify endpoint in `src/routes/api.js`
3. Update `scripts/test-db-connection.js` if CLI needed

---

## Quick Reference

### Start Development
```bash
npm run dev
```

### Test Database CLI
```bash
npm run test:db -- --help
```

### Key URLs
- App: http://localhost:3000
- API: http://localhost:3000/api/*

### RankMath Meta Keys
```
rank_math_schema_[Type]
rank_math_rich_snippet
```

### Database Table
```
wp_postmeta (post_id, meta_key, meta_value)
```

---

*Document created for development handoff. Last session added direct database injection feature with full safety controls (dry-run, backup, rollback).*
