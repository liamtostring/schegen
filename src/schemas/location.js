/**
 * Location/Service Area page schema template
 * For pages like "AC Repair in Houston" or "HVAC Services Dallas"
 */

/**
 * Generate schemas for a location/service area page
 * @param {object} pageData - Scraped page data
 * @param {object} orgInfo - Organization information
 * @param {object} options - Additional options
 * @returns {array} - Array of schema objects for @graph
 */
function generate(pageData, orgInfo, options = {}) {
  const schemas = [];

  // Extract location from page
  const locationInfo = extractLocation(pageData);
  const locationName = locationInfo.city || options.areaServed || 'Service Area';

  // 1. Service schema for this location
  const serviceSchema = {
    '@type': 'Service',
    '@id': `${pageData.url}#service`,
    'name': pageData.title || `HVAC Services in ${locationName}`,
    'description': truncate(pageData.description, 200),
    'url': pageData.url,
    'provider': {
      '@type': 'LocalBusiness',
      '@id': `${orgInfo.url}#localbusiness`
    },
    'areaServed': {
      '@type': 'City',
      'name': locationName
    }
  };

  // Add state if detected
  if (locationInfo.state) {
    serviceSchema.areaServed.containedInPlace = {
      '@type': 'State',
      'name': locationInfo.state
    };
  }

  // Detect service type from content
  const serviceType = extractServiceType(pageData);
  if (serviceType) {
    serviceSchema.serviceType = serviceType;
  }

  if (pageData.featuredImage) {
    serviceSchema.image = {
      '@type': 'ImageObject',
      'url': pageData.featuredImage
    };
  }

  schemas.push(serviceSchema);

  // 2. LocalBusiness schema with this specific service area
  const businessSchema = {
    '@type': options.businessType || 'HVACBusiness',
    '@id': `${orgInfo.url}#localbusiness`,
    'name': orgInfo.name,
    'url': orgInfo.url,
    'areaServed': {
      '@type': 'City',
      'name': locationName
    }
  };

  if (orgInfo.logo) {
    businessSchema.logo = {
      '@type': 'ImageObject',
      'url': orgInfo.logo
    };
    businessSchema.image = businessSchema.logo;
  }

  if (options.phone || pageData.phone) {
    businessSchema.telephone = options.phone || pageData.phone;
  }

  // Add geo coordinates if available
  if (locationInfo.geo) {
    businessSchema.geo = {
      '@type': 'GeoCoordinates',
      'latitude': locationInfo.geo.lat,
      'longitude': locationInfo.geo.lng
    };
  }

  // Add address - REQUIRED by Google for LocalBusiness
  // Always add at minimum the city/state from the location
  businessSchema.address = {
    '@type': 'PostalAddress',
    'addressLocality': locationName,
    'addressRegion': locationInfo.state || '',
    'addressCountry': locationInfo.country || 'CA'
  };

  // Service catalog
  businessSchema.hasOfferCatalog = {
    '@type': 'OfferCatalog',
    'name': `HVAC Services in ${locationName}`,
    'itemListElement': getHVACServices().map(service => ({
      '@type': 'Offer',
      'itemOffered': {
        '@type': 'Service',
        'name': service,
        'areaServed': {
          '@type': 'City',
          'name': locationName
        }
      }
    }))
  };

  schemas.push(businessSchema);

  // 3. Place schema for the location itself
  const placeSchema = {
    '@type': 'Place',
    '@id': `${pageData.url}#place`,
    'name': locationName,
    'address': {
      '@type': 'PostalAddress',
      'addressLocality': locationName,
      'addressRegion': locationInfo.state || '',
      'addressCountry': locationInfo.country || 'CA'
    }
  };

  if (locationInfo.geo) {
    placeSchema.geo = {
      '@type': 'GeoCoordinates',
      'latitude': locationInfo.geo.lat,
      'longitude': locationInfo.geo.lng
    };
  }

  schemas.push(placeSchema);

  return schemas;
}

/**
 * Extract location information from page data
 */
function extractLocation(pageData) {
  const title = pageData.title || '';
  const url = pageData.url || '';
  const content = pageData.content || '';

  const locationInfo = {
    city: null,
    state: null,
    geo: null,
    address: null
  };

  // Common patterns for location in title/URL
  // "AC Repair in Houston" or "Houston AC Repair" or "/locations/houston/"
  const locationPatterns = [
    /(?:in|near|serving)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:AC|HVAC|Heating|Cooling|Air)/i,
    /\/locations?\/([a-z-]+)/i,
    /\/([a-z-]+)-(?:ac|hvac|heating|cooling)/i,
    /\/(?:ac|hvac|heating|cooling)-([a-z-]+)/i
  ];

  // Try to extract from title first
  for (const pattern of locationPatterns) {
    const match = title.match(pattern);
    if (match) {
      locationInfo.city = formatCityName(match[1]);
      break;
    }
  }

  // Try URL if not found in title
  if (!locationInfo.city) {
    for (const pattern of locationPatterns) {
      const match = url.match(pattern);
      if (match) {
        locationInfo.city = formatCityName(match[1]);
        break;
      }
    }
  }

  // Canadian provinces
  const canadianProvinces = ['ON', 'Ontario', 'QC', 'Quebec', 'BC', 'British Columbia', 'AB', 'Alberta',
    'MB', 'Manitoba', 'SK', 'Saskatchewan', 'NS', 'Nova Scotia', 'NB', 'New Brunswick',
    'NL', 'Newfoundland', 'PE', 'Prince Edward Island', 'NT', 'YT', 'NU'];

  // Try to detect state/province
  const statePatterns = [
    /,\s*([A-Z]{2})\b/,
    /\b(Ontario|ON|Quebec|QC|British Columbia|BC|Alberta|AB|Manitoba|MB|Saskatchewan|SK|Nova Scotia|NS|New Brunswick|NB)\b/i,
    /\b(Texas|TX|California|CA|Florida|FL|Arizona|AZ|Nevada|NV|Colorado|CO|Georgia|GA|North Carolina|NC|Ohio|OH|Pennsylvania|PA|New York|NY|Illinois|IL|Michigan|MI|Virginia|VA|Washington|WA|Oregon|OR)\b/i
  ];

  const combinedText = title + ' ' + content;
  for (const pattern of statePatterns) {
    const match = combinedText.match(pattern);
    if (match) {
      locationInfo.state = normalizeState(match[1]);
      // Detect country based on province/state
      const normalized = match[1].toUpperCase();
      if (canadianProvinces.some(p => p.toUpperCase() === normalized)) {
        locationInfo.country = 'CA';
      } else {
        locationInfo.country = 'US';
      }
      break;
    }
  }

  // Default to CA if no state detected but looks Canadian (e.g., postal code in content)
  if (!locationInfo.country && /[A-Z]\d[A-Z]\s*\d[A-Z]\d/i.test(combinedText)) {
    locationInfo.country = 'CA';
  }

  return locationInfo;
}

/**
 * Format city name from URL slug or text
 */
function formatCityName(name) {
  if (!name) return null;
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

/**
 * Normalize state to abbreviation
 */
function normalizeState(state) {
  const stateMap = {
    'texas': 'TX', 'california': 'CA', 'florida': 'FL', 'arizona': 'AZ',
    'nevada': 'NV', 'colorado': 'CO', 'georgia': 'GA', 'north carolina': 'NC',
    'ohio': 'OH', 'pennsylvania': 'PA', 'new york': 'NY', 'illinois': 'IL',
    'michigan': 'MI', 'virginia': 'VA', 'washington': 'WA', 'oregon': 'OR'
  };

  const lower = state.toLowerCase();
  return stateMap[lower] || state.toUpperCase();
}

/**
 * Extract service type from content
 */
function extractServiceType(pageData) {
  const title = pageData.title || '';
  const content = pageData.content || '';
  const combinedText = title + ' ' + content;

  const servicePatterns = [
    { pattern: /ac\s*repair|air\s*condition(er|ing)\s*repair/i, type: 'Air Conditioning Repair' },
    { pattern: /ac\s*install|air\s*condition(er|ing)\s*install/i, type: 'Air Conditioning Installation' },
    { pattern: /heating\s*repair/i, type: 'Heating Repair' },
    { pattern: /furnace/i, type: 'Furnace Service' },
    { pattern: /heat\s*pump/i, type: 'Heat Pump Service' },
    { pattern: /hvac\s*service/i, type: 'HVAC Service' },
    { pattern: /hvac|heating.*cooling|air\s*condition/i, type: 'HVAC Service' }
  ];

  for (const { pattern, type } of servicePatterns) {
    if (pattern.test(combinedText)) {
      return type;
    }
  }

  return 'HVAC Service';
}

/**
 * Get common HVAC services list
 */
function getHVACServices() {
  return [
    'Air Conditioning Repair',
    'AC Installation',
    'Heating Repair',
    'Furnace Installation',
    'Heat Pump Service',
    'HVAC Maintenance',
    'Emergency HVAC Service',
    'Duct Cleaning'
  ];
}

/**
 * Truncate string
 */
function truncate(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

module.exports = {
  generate,
  extractLocation
};
