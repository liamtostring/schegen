/**
 * Detect whether a page is a blog/article or a service page
 */

const BLOG_URL_PATTERNS = [
  /\/blog\//i,
  /\/post\//i,
  /\/posts\//i,
  /\/news\//i,
  /\/article\//i,
  /\/articles\//i,
  /\/\d{4}\/\d{2}\//  // Date-based URLs like /2024/01/
];

const SERVICE_URL_PATTERNS = [
  /\/service\//i,
  /\/services\//i,
  /\/our-services\//i,
  /\/what-we-do\//i,
  /\/solutions\//i,
  // HVAC specific patterns
  /\/ac-/i,
  /\/air-conditioning/i,
  /\/heating/i,
  /\/hvac/i,
  /\/furnace/i,
  /\/heat-pump/i,
  /\/duct/i,
  /\/thermostat/i,
  /\/mini-split/i,
  /\/repair\//i,
  /\/installation\//i,
  /\/maintenance\//i,
  /\/tune-up/i,
  // Other home services
  /\/plumbing/i,
  /\/electrical/i,
  /\/roofing/i
];

const LOCATION_URL_PATTERNS = [
  /\/locations?\//i,
  /\/service-area/i,
  /\/areas?-(?:we-)?served?/i,
  /\/cities\//i,
  /\/near-me/i,
  // City-specific patterns (service + city)
  /\/(?:ac|hvac|heating|cooling|air-conditioning)-[a-z]+-[a-z]+/i,  // /ac-repair-houston
  /\/[a-z]+-(?:ac|hvac|heating|cooling)-/i,  // /houston-ac-repair
];

const SERVICE_KEYWORDS = [
  'service',
  'our services',
  'what we offer',
  'how we help',
  'pricing',
  'get started',
  'contact us',
  'free consultation',
  'request a quote',
  'free estimate',
  'schedule service',
  'book appointment',
  // HVAC specific
  'ac repair',
  'air conditioning',
  'heating repair',
  'hvac service',
  'furnace repair',
  'furnace installation',
  'heat pump',
  'duct cleaning',
  'emergency service',
  '24/7',
  'licensed',
  'certified technician',
  'same day service',
  'tune-up',
  'maintenance plan'
];

/**
 * Detect the page type based on URL patterns and content analysis
 * @param {string} url - The page URL
 * @param {object} pageData - Scraped page data
 * @returns {string} - 'article', 'service', or 'location'
 */
function detect(url, pageData) {
  const scores = {
    article: 0,
    service: 0,
    location: 0
  };

  // URL pattern matching
  for (const pattern of BLOG_URL_PATTERNS) {
    if (pattern.test(url)) {
      scores.article += 3;
      break;
    }
  }

  for (const pattern of SERVICE_URL_PATTERNS) {
    if (pattern.test(url)) {
      scores.service += 3;
      break;
    }
  }

  // Location URL patterns
  for (const pattern of LOCATION_URL_PATTERNS) {
    if (pattern.test(url)) {
      scores.location += 4;
      break;
    }
  }

  // WordPress post type
  if (pageData.wordpressInfo) {
    if (pageData.wordpressInfo.postType === 'post') {
      scores.article += 3;
    } else if (pageData.wordpressInfo.postType === 'page') {
      scores.service += 1;
    }
  }

  // Has author and publish date (strong blog indicators)
  if (pageData.author) {
    scores.article += 2;
  }

  if (pageData.publishDate) {
    scores.article += 2;
  }

  // Has categories or tags (blog indicators)
  if (pageData.categories && pageData.categories.length > 0) {
    scores.article += 2;
  }

  if (pageData.tags && pageData.tags.length > 0) {
    scores.article += 1;
  }

  // Content keyword analysis
  const content = (pageData.content || '').toLowerCase();
  const title = (pageData.title || '').toLowerCase();
  const combinedText = content + ' ' + title;

  for (const keyword of SERVICE_KEYWORDS) {
    if (combinedText.includes(keyword.toLowerCase())) {
      scores.service += 1;
    }
  }

  // Check for service-related headings
  if (pageData.headings) {
    for (const heading of pageData.headings) {
      const text = heading.text.toLowerCase();
      // Service indicators
      if (text.includes('service') || text.includes('solution') || text.includes('what we offer') ||
          text.includes('repair') || text.includes('installation') || text.includes('maintenance') ||
          text.includes('hvac') || text.includes('air conditioning') || text.includes('heating') ||
          text.includes('why choose') || text.includes('our process') || text.includes('benefits')) {
        scores.service += 2;
      }
      // Article indicators
      if (text.includes('written by') || text.includes('posted by') || text.includes('author') ||
          text.includes('published') || text.includes('read more')) {
        scores.article += 2;
      }
      // Location indicators
      if (text.includes('serving') || text.includes('service area') || text.includes('near you') ||
          text.includes('in your area') || text.includes('local')) {
        scores.location += 2;
      }
    }
  }

  // Check for location patterns in title and content
  const locationPatterns = [
    /(?:in|near|serving)\s+[A-Z][a-z]+/,  // "in Houston", "near Dallas"
    /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:AC|HVAC|Heating|Cooling)/,  // "Houston AC Repair"
    /service\s+area/i,
    /areas?\s+we\s+serve/i,
    /locations?\s+served/i,
    /serving\s+the\s+[A-Z]/i
  ];

  for (const pattern of locationPatterns) {
    if (pattern.test(title) || pattern.test(content.substring(0, 1000))) {
      scores.location += 2;
    }
  }

  // No publish date is a service/location indicator
  if (!pageData.publishDate) {
    scores.service += 1;
    scores.location += 1;
  }

  // Determine winner
  const maxScore = Math.max(scores.article, scores.service, scores.location);

  // Location must have significant score to win
  if (scores.location >= maxScore && scores.location >= 4) {
    return 'location';
  }

  // Return the type with highest score, default to article if tied
  return scores.service > scores.article ? 'service' : 'article';
}

/**
 * Get detailed detection info for debugging
 */
function detectWithDetails(url, pageData) {
  const pageType = detect(url, pageData);

  return {
    pageType,
    indicators: {
      urlPatterns: {
        hasBlogPattern: BLOG_URL_PATTERNS.some(p => p.test(url)),
        hasServicePattern: SERVICE_URL_PATTERNS.some(p => p.test(url))
      },
      wordpress: pageData.wordpressInfo,
      hasAuthor: !!pageData.author,
      hasPublishDate: !!pageData.publishDate,
      hasCategories: pageData.categories && pageData.categories.length > 0,
      hasTags: pageData.tags && pageData.tags.length > 0
    }
  };
}

module.exports = {
  detect,
  detectWithDetails
};
