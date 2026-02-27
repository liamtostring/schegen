/**
 * Article/BlogPosting schema template
 * Following Google's structured data guidelines
 */

/**
 * Generate an Article schema
 * @param {object} pageData - Scraped page data
 * @param {object} orgInfo - Organization information
 * @returns {object} - JSON-LD Article schema
 */
function generate(pageData, orgInfo, options = {}) {
  const schema = {
    '@type': 'Article',
    '@id': `${pageData.url}#article`,
    'headline': truncate(pageData.title, 110),
    'description': truncate(pageData.description, 200),
    'url': pageData.url,
    'mainEntityOfPage': {
      '@id': `${pageData.url.replace(/\/$/, '')}/#webpage`
    }
  };

  // Add image if available
  if (pageData.featuredImage) {
    schema.image = pageData.featuredImage;
  }

  // Add author
  if (pageData.author) {
    schema.author = {
      '@type': 'Person',
      'name': pageData.author
    };
  } else {
    // Fallback to organization as author
    schema.author = {
      '@type': 'Organization',
      'name': orgInfo.name
    };
  }

  // Add publisher (required for Article)
  schema.publisher = {
    '@type': 'Organization',
    'name': orgInfo.name
  };

  if (orgInfo.logo) {
    schema.publisher.logo = {
      '@type': 'ImageObject',
      'url': orgInfo.logo
    };
  }

  if (options.sameAs && options.sameAs.length > 0) {
    schema.publisher.sameAs = options.sameAs;
  }

  // Add dates
  if (pageData.publishDate) {
    schema.datePublished = pageData.publishDate;
  }

  if (pageData.modifiedDate) {
    schema.dateModified = pageData.modifiedDate;
  } else if (pageData.publishDate) {
    schema.dateModified = pageData.publishDate;
  }

  // Add keywords from tags
  if (pageData.tags && pageData.tags.length > 0) {
    schema.keywords = pageData.tags.join(', ');
  }

  // Add article section from categories
  if (pageData.categories && pageData.categories.length > 0) {
    schema.articleSection = pageData.categories[0];
  }

  return schema;
}

/**
 * Truncate string to max length
 */
function truncate(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

module.exports = {
  generate
};
