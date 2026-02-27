/**
 * Schema Generator - Main entry point for generating JSON-LD schemas
 * Generates comprehensive schemas for HVAC and Home Services websites
 */

const articleSchema = require('../schemas/article');
const serviceSchema = require('../schemas/service');
const locationSchema = require('../schemas/location');
const faqSchema = require('../schemas/faq');
const localBusinessSchema = require('../schemas/localBusiness');
const breadcrumbSchema = require('../schemas/breadcrumb');

/**
 * Generate comprehensive schema with multiple types combined in @graph
 * @param {string} pageType - 'article' or 'service'
 * @param {object} pageData - Scraped page data
 * @param {object} orgInfo - Organization information
 * @param {object} options - Additional options
 * @returns {object} - Generated JSON-LD schema with @graph
 */
function generate(pageType, pageData, orgInfo, options = {}) {
  const schemas = [];

  // 1. Generate primary schema based on page type
  if (pageType === 'location') {
    // Location pages get special treatment with multiple schemas
    const locationSchemas = locationSchema.generate(pageData, orgInfo, options);
    schemas.push(...locationSchemas);
  } else if (pageType === 'service') {
    schemas.push(serviceSchema.generate(pageData, orgInfo, options));

    // 2. Generate LocalBusiness/HVACBusiness schema (for service pages)
    const businessOptions = {
      areaServed: options.areaServed,
      phone: pageData.phone || options.phone,
      serviceAreas: pageData.serviceAreas,
      businessType: options.businessType || 'HVACBusiness',
      address: options.address,
      sameAs: options.sameAs
    };
    schemas.push(localBusinessSchema.generate(orgInfo, businessOptions));
  } else {
    // Article
    schemas.push(articleSchema.generate(pageData, orgInfo, options));
  }

  // 3. Generate FAQPage schema if FAQs detected
  if (pageData.faqs && pageData.faqs.length > 0) {
    const faq = faqSchema.generate(pageData.faqs);
    if (faq) {
      schemas.push(faq);
    }
  }

  // 4. Generate BreadcrumbList schema
  let breadcrumbs = pageData.breadcrumbs;
  if (!breadcrumbs || breadcrumbs.length < 2) {
    // Generate from URL if not found on page
    breadcrumbs = breadcrumbSchema.generateFromUrl(pageData.url, orgInfo.name);
  }
  if (breadcrumbs && breadcrumbs.length >= 2) {
    const breadcrumb = breadcrumbSchema.generate(breadcrumbs);
    if (breadcrumb) {
      schemas.push(breadcrumb);
    }
  }

  // 5. Add featured image as a standalone ImageObject (with @id for RankMath cross-referencing)
  const pageUrl = pageData.url.replace(/\/$/, '');
  if (pageData.featuredImage) {
    schemas.push({
      '@type': 'ImageObject',
      '@id': `${pageUrl}/#primaryimage`,
      'url': pageData.featuredImage,
      'contentUrl': pageData.featuredImage,
      'inLanguage': 'en-US'
    });
  }

  // 6. Add WebPage schema to tie everything together
  const webPageSchema = {
    '@type': 'WebPage',
    '@id': `${pageUrl}/#webpage`,
    'url': pageData.url,
    'name': pageData.title,
    'description': pageData.description,
    'isPartOf': {
      '@type': 'WebSite',
      '@id': `${orgInfo.url}#website`,
      'name': orgInfo.name,
      'url': orgInfo.url,
      ...(options.sameAs && options.sameAs.length > 0 ? { 'sameAs': options.sameAs } : {})
    }
  };

  if (pageData.featuredImage) {
    webPageSchema.primaryImageOfPage = {
      '@id': `${pageUrl}/#primaryimage`
    };
  }

  schemas.push(webPageSchema);

  // Combine into @graph structure
  return {
    '@context': 'https://schema.org',
    '@graph': schemas
  };
}

/**
 * Generate single schema (legacy support)
 * @param {string} pageType - 'article' or 'service'
 * @param {object} pageData - Scraped page data
 * @param {object} orgInfo - Organization information
 * @param {object} options - Additional options
 * @returns {object} - Single schema object (not graph)
 */
function generateSingle(pageType, pageData, orgInfo, options = {}) {
  if (pageType === 'service') {
    const schema = serviceSchema.generate(pageData, orgInfo, options);
    return {
      '@context': 'https://schema.org',
      ...schema
    };
  }
  return {
    '@context': 'https://schema.org',
    ...articleSchema.generate(pageData, orgInfo)
  };
}

/**
 * Generate schema with auto-detection of page type
 * @param {string} url - Page URL
 * @param {object} pageData - Scraped page data
 * @param {object} orgInfo - Organization information
 * @param {object} options - Additional options
 * @returns {object} - Generated schema with metadata
 */
function generateWithDetection(url, pageData, orgInfo, options = {}) {
  const pageTypeDetector = require('./pageTypeDetector');
  const pageType = pageTypeDetector.detect(url, pageData);

  return {
    pageType,
    schema: generate(pageType, pageData, orgInfo, options)
  };
}

/**
 * Validate a schema object has required fields
 * Supports both single schemas and @graph arrays
 * @param {object} schema - Schema to validate
 * @returns {object} - Validation result
 */
function validate(schema) {
  const errors = [];
  const warnings = [];

  if (!schema['@context']) {
    errors.push('Missing @context');
  }

  // Handle @graph structure
  const schemasToValidate = schema['@graph'] ? schema['@graph'] : [schema];

  for (const s of schemasToValidate) {
    const type = s['@type'];

    if (!type) {
      errors.push('Missing @type in schema');
      continue;
    }

    if (type === 'Article') {
      if (!s.headline) errors.push('Article: Missing headline');
      if (!s.author) warnings.push('Article: Missing author');
      if (!s.datePublished) warnings.push('Article: Missing datePublished');
      if (!s.publisher) warnings.push('Article: Missing publisher');
      if (!s.image) warnings.push('Article: Missing image (recommended)');
    }

    if (type === 'Service') {
      if (!s.name) errors.push('Service: Missing name');
      if (!s.provider) warnings.push('Service: Missing provider');
      if (!s.description) warnings.push('Service: Missing description');
    }

    if (type === 'FAQPage') {
      if (!s.mainEntity || s.mainEntity.length === 0) {
        errors.push('FAQPage: Missing mainEntity (questions)');
      }
    }

    if (type === 'LocalBusiness' || type === 'HVACBusiness') {
      if (!s.name) errors.push(`${type}: Missing name`);
      if (!s.url) warnings.push(`${type}: Missing url`);
    }

    if (type === 'BreadcrumbList') {
      if (!s.itemListElement || s.itemListElement.length < 2) {
        warnings.push('BreadcrumbList: Should have at least 2 items');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    schemaCount: schemasToValidate.length
  };
}

/**
 * Format schema as script tag for HTML insertion
 * @param {object} schema - Schema object
 * @returns {string} - HTML script tag
 */
function toScriptTag(schema) {
  return `<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>`;
}

/**
 * Format schema for RankMath insertion
 * RankMath prefers individual schemas, so we split the @graph
 * @param {object} schema - Schema object (may contain @graph)
 * @param {string} pageType - Page type
 * @returns {object} - Formatted for RankMath meta
 */
function toRankMathFormat(schema, pageType) {
  // RankMath can handle the full @graph schema
  // But for better compatibility, we use a custom key
  const key = 'rank_math_schema_' + (pageType === 'service' ? 'Service' : 'Article');

  return {
    key,
    value: JSON.stringify(schema)
  };
}

/**
 * Get summary of schemas included
 * @param {object} schema - Schema object
 * @returns {array} - List of schema types included
 */
function getSchemaTypes(schema) {
  if (schema['@graph']) {
    return schema['@graph'].map(s => s['@type']);
  }
  return [schema['@type']];
}

module.exports = {
  generate,
  generateSingle,
  generateWithDetection,
  validate,
  toScriptTag,
  toRankMathFormat,
  getSchemaTypes
};
