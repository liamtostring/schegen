/**
 * Service schema template
 * Following Google's structured data guidelines
 * Optimized for HVAC and Home Services
 */

// Canadian provinces
const CANADIAN_PROVINCES = ['ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'NT', 'YT', 'NU'];

// US States
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
  'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

// Canadian cities by province
const CANADIAN_CITIES = {
  'ON': ['Hamilton', 'Toronto', 'Ottawa', 'Mississauga', 'Brampton', 'Burlington', 'Oakville',
    'Stoney Creek', 'Ancaster', 'Dundas', 'Waterdown', 'Grimsby', 'St. Catharines', 'St Catharines',
    'Niagara Falls', 'London', 'Kitchener', 'Waterloo', 'Cambridge', 'Guelph', 'Binbrook', 'Brantford'],
  'BC': ['Vancouver', 'Victoria', 'Burnaby', 'Surrey', 'Richmond', 'Kelowna'],
  'AB': ['Calgary', 'Edmonton', 'Red Deer', 'Lethbridge'],
  'QC': ['Montreal', 'Quebec City', 'Laval', 'Gatineau']
};

// US cities by state
const US_CITIES = {
  'TX': ['Houston', 'Dallas', 'Austin', 'San Antonio', 'Fort Worth', 'El Paso', 'Arlington', 'Plano'],
  'CA': ['Los Angeles', 'San Diego', 'San Jose', 'San Francisco', 'Sacramento', 'Long Beach', 'Oakland'],
  'FL': ['Miami', 'Tampa', 'Orlando', 'Jacksonville', 'Fort Lauderdale', 'St. Petersburg'],
  'NY': ['New York', 'Brooklyn', 'Buffalo', 'Rochester', 'Syracuse', 'Albany'],
  'IL': ['Chicago', 'Aurora', 'Naperville', 'Joliet', 'Rockford'],
  'PA': ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie'],
  'AZ': ['Phoenix', 'Tucson', 'Mesa', 'Chandler', 'Scottsdale'],
  'GA': ['Atlanta', 'Augusta', 'Columbus', 'Savannah'],
  'NC': ['Charlotte', 'Raleigh', 'Greensboro', 'Durham'],
  'OH': ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron'],
  'MI': ['Detroit', 'Grand Rapids', 'Ann Arbor', 'Lansing'],
  'TN': ['Nashville', 'Memphis', 'Knoxville', 'Chattanooga'],
  'WA': ['Seattle', 'Spokane', 'Tacoma', 'Bellevue'],
  'CO': ['Denver', 'Colorado Springs', 'Aurora', 'Fort Collins'],
  'MA': ['Boston', 'Worcester', 'Springfield', 'Cambridge'],
  'NV': ['Las Vegas', 'Henderson', 'Reno'],
  'IN': ['Indianapolis', 'Fort Wayne', 'Evansville'],
  'MO': ['Kansas City', 'St. Louis', 'Springfield'],
  'MD': ['Baltimore', 'Frederick', 'Rockville'],
  'VA': ['Virginia Beach', 'Norfolk', 'Richmond', 'Alexandria']
};

/**
 * Detect country from address or service areas
 */
function detectCountryFromAreas(address, areaServedArray) {
  // Check address first (most reliable)
  if (address) {
    if (address.addressCountry) return address.addressCountry;
    // Canadian postal code: A1A 1A1
    if (address.postalCode && /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(address.postalCode)) return 'CA';
    // US ZIP: 12345
    if (address.postalCode && /^\d{5}(-\d{4})?$/.test(address.postalCode)) return 'US';
    // Check region
    if (address.addressRegion) {
      const region = address.addressRegion.toUpperCase();
      if (CANADIAN_PROVINCES.includes(region)) return 'CA';
      if (US_STATES.includes(region)) return 'US';
    }
  }

  // Check service areas for known cities
  const allText = areaServedArray.join(' ').toLowerCase();

  // Check Canadian cities
  for (const [province, cities] of Object.entries(CANADIAN_CITIES)) {
    for (const city of cities) {
      if (allText.includes(city.toLowerCase())) {
        return 'CA';
      }
    }
  }

  // Check US cities
  for (const [state, cities] of Object.entries(US_CITIES)) {
    for (const city of cities) {
      if (allText.includes(city.toLowerCase())) {
        return 'US';
      }
    }
  }

  // Default to US
  return 'US';
}

/**
 * Detect region from areas
 */
function detectRegionFromAreas(address, areaServedArray, country) {
  if (address && address.addressRegion) return address.addressRegion;

  const allText = areaServedArray.join(' ').toLowerCase();

  // For Canada
  if (country === 'CA') {
    for (const [province, cities] of Object.entries(CANADIAN_CITIES)) {
      for (const city of cities) {
        if (allText.includes(city.toLowerCase())) {
          return province;
        }
      }
    }
  }

  // For US
  if (country === 'US') {
    for (const [state, cities] of Object.entries(US_CITIES)) {
      for (const city of cities) {
        if (allText.includes(city.toLowerCase())) {
          return state;
        }
      }
    }
  }

  return '';
}

/**
 * Generate a Service schema
 * @param {object} pageData - Scraped page data
 * @param {object} orgInfo - Organization information
 * @param {object} options - Additional options like areaServed
 * @returns {object} - JSON-LD Service schema
 */
function generate(pageData, orgInfo, options = {}) {
  const serviceInfo = extractServiceType(pageData);

  // Parse areaServed into array for use in multiple places
  let areaServedArray = [];
  if (options.areaServed) {
    areaServedArray = options.areaServed.split(',').map(a => a.trim()).filter(a => a);
  }

  // Try to extract location from page if no areaServed provided
  if (areaServedArray.length === 0) {
    const extractedLocation = extractLocationFromPage(pageData);
    if (extractedLocation) {
      areaServedArray = [extractedLocation];
    }
  }

  const schema = {
    '@type': 'Service',
    '@id': `${pageData.url}#service`,
    'name': serviceInfo.name || pageData.title,
    'description': truncate(pageData.description, 200),
    'url': pageData.url,
    'serviceType': serviceInfo.type,
    'provider': {
      '@type': options.businessType || 'HVACBusiness',
      '@id': `${orgInfo.url}#localbusiness`,
      'name': orgInfo.name,
      'url': orgInfo.url
    }
  };

  // Detect country from various sources
  const detectedCountry = detectCountryFromAreas(options.address, areaServedArray);
  const detectedRegion = detectRegionFromAreas(options.address, areaServedArray, detectedCountry);

  // Add address to provider (REQUIRED by Google for LocalBusiness)
  // Always include address - derive from areaServed, options.address, or page data
  if (options.address && options.address.addressLocality) {
    schema.provider.address = {
      '@type': 'PostalAddress',
      'addressCountry': options.address.addressCountry || detectedCountry
    };
    if (options.address.streetAddress) schema.provider.address.streetAddress = options.address.streetAddress;
    if (options.address.addressLocality) schema.provider.address.addressLocality = options.address.addressLocality;
    if (options.address.addressRegion) {
      schema.provider.address.addressRegion = options.address.addressRegion;
    } else if (detectedRegion) {
      schema.provider.address.addressRegion = detectedRegion;
    }
    if (options.address.postalCode) schema.provider.address.postalCode = options.address.postalCode;
  } else if (areaServedArray.length > 0) {
    const primaryArea = areaServedArray[0];
    const parts = primaryArea.split(',').map(p => p.trim());
    schema.provider.address = {
      '@type': 'PostalAddress',
      'addressLocality': parts[0],
      'addressRegion': parts[1] || detectedRegion,
      'addressCountry': detectedCountry
    };
  } else {
    // Fallback: minimal address with country only
    // Google requires address field to be present
    schema.provider.address = {
      '@type': 'PostalAddress',
      'addressCountry': detectedCountry
    };
    if (detectedRegion) {
      schema.provider.address.addressRegion = detectedRegion;
    }
  }

  // Add areaServed to provider
  if (areaServedArray.length > 0) {
    schema.provider.areaServed = areaServedArray.map(area => ({
      '@type': 'City',
      'name': area
    }));
  }

  // Add phone to provider
  if (options.phone || pageData.phone) {
    schema.provider.telephone = options.phone || pageData.phone;
  }

  // Add organization logo
  if (orgInfo.logo) {
    schema.provider.logo = {
      '@type': 'ImageObject',
      'url': orgInfo.logo
    };
  }

  // Add service image
  if (pageData.featuredImage) {
    schema.image = {
      '@type': 'ImageObject',
      'url': pageData.featuredImage
    };
  }

  // Add area served - REQUIRED for service schemas
  if (areaServedArray.length === 1) {
    schema.areaServed = {
      '@type': 'City',
      'name': areaServedArray[0]
    };
  } else if (areaServedArray.length > 1) {
    schema.areaServed = areaServedArray.map(area => ({
      '@type': 'City',
      'name': area
    }));
  }

  // Add brand
  schema.brand = {
    '@type': 'Brand',
    'name': orgInfo.name
  };

  // Add category for HVAC services
  if (serviceInfo.category) {
    schema.category = serviceInfo.category;
  }

  // Add offers structure for services
  schema.offers = {
    '@type': 'Offer',
    'availability': 'https://schema.org/InStock',
    'areaServed': schema.areaServed
  };

  // Add potential action (contact)
  schema.potentialAction = {
    '@type': 'ReserveAction',
    'target': {
      '@type': 'EntryPoint',
      'urlTemplate': orgInfo.url + '/contact',
      'actionPlatform': [
        'https://schema.org/DesktopWebPlatform',
        'https://schema.org/MobileWebPlatform'
      ]
    },
    'result': {
      '@type': 'Reservation',
      'name': 'Service Appointment'
    }
  };

  return schema;
}

/**
 * Try to extract service type from page data
 * Optimized for HVAC and Home Services
 */
function extractServiceType(pageData) {
  const title = pageData.title || '';
  const content = pageData.content || '';
  const headings = pageData.headings || [];

  // HVAC and Home Services patterns (ordered by specificity)
  const servicePatterns = [
    // AC Services
    { pattern: /ac\s*repair|air\s*condition(er|ing)\s*repair/i, type: 'Air Conditioning Repair', category: 'HVAC', name: 'Air Conditioning Repair Service' },
    { pattern: /ac\s*install|air\s*condition(er|ing)\s*install/i, type: 'Air Conditioning Installation', category: 'HVAC', name: 'AC Installation Service' },
    { pattern: /ac\s*maintenance|air\s*condition(er|ing)\s*maintenance/i, type: 'Air Conditioning Maintenance', category: 'HVAC', name: 'AC Maintenance Service' },
    { pattern: /ac\s*tune[\s-]*up|air\s*condition(er|ing)\s*tune[\s-]*up/i, type: 'Air Conditioning Tune-Up', category: 'HVAC', name: 'AC Tune-Up Service' },
    { pattern: /ac\s*replacement|air\s*condition(er|ing)\s*replacement/i, type: 'Air Conditioning Replacement', category: 'HVAC', name: 'AC Replacement Service' },
    { pattern: /central\s*air/i, type: 'Central Air Conditioning Service', category: 'HVAC', name: 'Central Air Conditioning Service' },

    // Heating Services
    { pattern: /heat(er|ing)\s*repair/i, type: 'Heating Repair', category: 'HVAC', name: 'Heating Repair Service' },
    { pattern: /heat(er|ing)\s*install/i, type: 'Heating Installation', category: 'HVAC', name: 'Heating Installation Service' },
    { pattern: /heat(er|ing)\s*maintenance/i, type: 'Heating Maintenance', category: 'HVAC', name: 'Heating Maintenance Service' },
    { pattern: /furnace\s*repair/i, type: 'Furnace Repair', category: 'HVAC', name: 'Furnace Repair Service' },
    { pattern: /furnace\s*install/i, type: 'Furnace Installation', category: 'HVAC', name: 'Furnace Installation Service' },
    { pattern: /furnace\s*maintenance|furnace\s*tune[\s-]*up/i, type: 'Furnace Maintenance', category: 'HVAC', name: 'Furnace Maintenance Service' },
    { pattern: /furnace\s*replacement/i, type: 'Furnace Replacement', category: 'HVAC', name: 'Furnace Replacement Service' },
    { pattern: /boiler\s*repair/i, type: 'Boiler Repair', category: 'HVAC', name: 'Boiler Repair Service' },
    { pattern: /boiler\s*install/i, type: 'Boiler Installation', category: 'HVAC', name: 'Boiler Installation Service' },

    // Heat Pump
    { pattern: /heat\s*pump\s*repair/i, type: 'Heat Pump Repair', category: 'HVAC', name: 'Heat Pump Repair Service' },
    { pattern: /heat\s*pump\s*install/i, type: 'Heat Pump Installation', category: 'HVAC', name: 'Heat Pump Installation Service' },
    { pattern: /heat\s*pump\s*maintenance/i, type: 'Heat Pump Maintenance', category: 'HVAC', name: 'Heat Pump Maintenance Service' },
    { pattern: /heat\s*pump/i, type: 'Heat Pump Service', category: 'HVAC', name: 'Heat Pump Service' },

    // Ductwork
    { pattern: /duct\s*clean/i, type: 'Duct Cleaning', category: 'HVAC', name: 'Air Duct Cleaning Service' },
    { pattern: /duct\s*repair/i, type: 'Duct Repair', category: 'HVAC', name: 'Ductwork Repair Service' },
    { pattern: /duct\s*install|ductwork\s*install/i, type: 'Duct Installation', category: 'HVAC', name: 'Ductwork Installation Service' },
    { pattern: /duct\s*seal/i, type: 'Duct Sealing', category: 'HVAC', name: 'Duct Sealing Service' },

    // Indoor Air Quality
    { pattern: /indoor\s*air\s*quality|iaq/i, type: 'Indoor Air Quality', category: 'HVAC', name: 'Indoor Air Quality Service' },
    { pattern: /air\s*purif/i, type: 'Air Purification', category: 'HVAC', name: 'Air Purification Service' },
    { pattern: /air\s*filter/i, type: 'Air Filtration', category: 'HVAC', name: 'Air Filtration Service' },
    { pattern: /humidifier/i, type: 'Humidifier Service', category: 'HVAC', name: 'Humidifier Installation & Service' },
    { pattern: /dehumidifier/i, type: 'Dehumidifier Service', category: 'HVAC', name: 'Dehumidifier Installation & Service' },
    { pattern: /uv\s*light|uv\s*air/i, type: 'UV Air Purification', category: 'HVAC', name: 'UV Air Purification Service' },

    // Thermostat
    { pattern: /thermostat\s*install/i, type: 'Thermostat Installation', category: 'HVAC', name: 'Thermostat Installation Service' },
    { pattern: /smart\s*thermostat/i, type: 'Smart Thermostat Installation', category: 'HVAC', name: 'Smart Thermostat Installation Service' },
    { pattern: /thermostat/i, type: 'Thermostat Service', category: 'HVAC', name: 'Thermostat Service' },

    // Mini Split
    { pattern: /mini[\s-]*split\s*install/i, type: 'Mini Split Installation', category: 'HVAC', name: 'Ductless Mini Split Installation' },
    { pattern: /mini[\s-]*split\s*repair/i, type: 'Mini Split Repair', category: 'HVAC', name: 'Ductless Mini Split Repair' },
    { pattern: /mini[\s-]*split|ductless/i, type: 'Ductless HVAC Service', category: 'HVAC', name: 'Ductless Mini Split Service' },

    // Emergency & General HVAC
    { pattern: /emergency\s*(hvac|ac|heat|air)/i, type: 'Emergency HVAC Service', category: 'HVAC', name: '24/7 Emergency HVAC Service' },
    { pattern: /24[\s\/]*7|after\s*hours/i, type: 'Emergency HVAC Service', category: 'HVAC', name: '24/7 Emergency HVAC Service' },
    { pattern: /hvac\s*repair/i, type: 'HVAC Repair', category: 'HVAC', name: 'HVAC Repair Service' },
    { pattern: /hvac\s*install/i, type: 'HVAC Installation', category: 'HVAC', name: 'HVAC Installation Service' },
    { pattern: /hvac\s*maintenance/i, type: 'HVAC Maintenance', category: 'HVAC', name: 'HVAC Maintenance Service' },

    // Refrigerant & Specific
    { pattern: /refrigerant|freon/i, type: 'Refrigerant Service', category: 'HVAC', name: 'Refrigerant Recharge Service' },
    { pattern: /compressor/i, type: 'Compressor Service', category: 'HVAC', name: 'AC Compressor Service' },
    { pattern: /evaporator\s*coil/i, type: 'Evaporator Coil Service', category: 'HVAC', name: 'Evaporator Coil Service' },
    { pattern: /condenser/i, type: 'Condenser Service', category: 'HVAC', name: 'Condenser Service' },

    // Other Home Services
    { pattern: /plumb(ing|er)/i, type: 'Plumbing Service', category: 'Home Services', name: 'Plumbing Service' },
    { pattern: /electric(al|ian)/i, type: 'Electrical Service', category: 'Home Services', name: 'Electrical Service' },
    { pattern: /roof(ing)?/i, type: 'Roofing Service', category: 'Home Services', name: 'Roofing Service' },
    { pattern: /water\s*heater/i, type: 'Water Heater Service', category: 'Home Services', name: 'Water Heater Service' },
    { pattern: /insulation/i, type: 'Insulation Service', category: 'Home Services', name: 'Insulation Service' },

    // Commercial
    { pattern: /commercial\s*(hvac|ac|heat)/i, type: 'Commercial HVAC Service', category: 'Commercial HVAC', name: 'Commercial HVAC Service' },

    // Generic HVAC catch-all
    { pattern: /hvac|heating|cooling|air\s*condition/i, type: 'HVAC Service', category: 'HVAC', name: 'HVAC Service' }
  ];

  const combinedText = title + ' ' + content + ' ' + headings.map(h => h.text).join(' ');

  for (const { pattern, type, category, name } of servicePatterns) {
    if (pattern.test(combinedText)) {
      return { type, category, name };
    }
  }

  // Default: use the title as service type
  return { type: title, name: title, category: 'Service' };
}

/**
 * Try to extract location from page data (title, URL, content)
 * This is used as a fallback when no areaServed is provided
 */
function extractLocationFromPage(pageData) {
  const title = pageData.title || '';
  const url = pageData.url || '';
  const content = pageData.content || '';

  // Common city names to look for (US and Canadian)
  // Flatten all cities from both country lists
  const allCanadianCities = Object.values(CANADIAN_CITIES).flat();
  const allUSCities = Object.values(US_CITIES).flat();
  const commonCities = [...allUSCities, ...allCanadianCities];

  // Patterns for location in title/URL
  const locationPatterns = [
    /(?:in|near|serving)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:AC|HVAC|Heating|Cooling|Air|Plumbing|Electric)/i,
    /\/locations?\/([a-z-]+)/i,
    /\/([a-z-]+)-(?:ac|hvac|heating|cooling|plumbing)/i,
    /\/(?:ac|hvac|heating|cooling|plumbing)-([a-z-]+)/i,
    /\/service-area\/([a-z-]+)/i
  ];

  // Try to find a known city name first
  const combinedText = title + ' ' + content;
  for (const city of commonCities) {
    const regex = new RegExp(`\\b${city}\\b`, 'i');
    if (regex.test(combinedText)) {
      return city;
    }
  }

  // Try patterns on title
  for (const pattern of locationPatterns) {
    const match = title.match(pattern);
    if (match) {
      return formatLocationName(match[1]);
    }
  }

  // Try patterns on URL
  for (const pattern of locationPatterns) {
    const match = url.match(pattern);
    if (match) {
      return formatLocationName(match[1]);
    }
  }

  return null;
}

/**
 * Format location name from URL slug
 */
function formatLocationName(name) {
  if (!name) return null;
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
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
