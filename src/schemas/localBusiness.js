/**
 * LocalBusiness/HVACBusiness schema template
 * For HVAC and home services companies
 */

// Canadian provinces
const CANADIAN_PROVINCES = {
  'ON': 'Ontario', 'QC': 'Quebec', 'BC': 'British Columbia', 'AB': 'Alberta',
  'MB': 'Manitoba', 'SK': 'Saskatchewan', 'NS': 'Nova Scotia', 'NB': 'New Brunswick',
  'NL': 'Newfoundland', 'PE': 'Prince Edward Island', 'NT': 'Northwest Territories',
  'YT': 'Yukon', 'NU': 'Nunavut'
};

// US States
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
  'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

// Canadian cities by province (for auto-detection)
const CANADIAN_CITIES = {
  'ON': ['Hamilton', 'Toronto', 'Ottawa', 'Mississauga', 'Brampton', 'Burlington', 'Oakville',
    'Stoney Creek', 'Ancaster', 'Dundas', 'Waterdown', 'Grimsby', 'St. Catharines', 'St Catharines',
    'Niagara Falls', 'Niagara', 'London', 'Kitchener', 'Waterloo', 'Cambridge', 'Guelph',
    'Binbrook', 'Caledonia', 'Brantford', 'Milton', 'Georgetown', 'Markham', 'Vaughan', 'Richmond Hill'],
  'BC': ['Vancouver', 'Victoria', 'Burnaby', 'Surrey', 'Richmond', 'Kelowna', 'Abbotsford'],
  'AB': ['Calgary', 'Edmonton', 'Red Deer', 'Lethbridge', 'Medicine Hat'],
  'QC': ['Montreal', 'Quebec City', 'Laval', 'Gatineau', 'Longueuil']
};

// Major US cities by state (for auto-detection)
const US_CITIES = {
  'TX': ['Houston', 'Dallas', 'Austin', 'San Antonio', 'Fort Worth', 'El Paso', 'Arlington', 'Plano', 'Frisco'],
  'CA': ['Los Angeles', 'San Diego', 'San Jose', 'San Francisco', 'Fresno', 'Sacramento', 'Long Beach', 'Oakland'],
  'FL': ['Miami', 'Tampa', 'Orlando', 'Jacksonville', 'Fort Lauderdale', 'St. Petersburg', 'Hialeah'],
  'NY': ['New York', 'Brooklyn', 'Buffalo', 'Rochester', 'Syracuse', 'Albany', 'Yonkers'],
  'IL': ['Chicago', 'Aurora', 'Naperville', 'Joliet', 'Rockford', 'Springfield'],
  'PA': ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie', 'Reading'],
  'AZ': ['Phoenix', 'Tucson', 'Mesa', 'Chandler', 'Scottsdale', 'Gilbert', 'Tempe'],
  'GA': ['Atlanta', 'Augusta', 'Columbus', 'Savannah', 'Athens', 'Macon'],
  'NC': ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Winston-Salem', 'Fayetteville'],
  'OH': ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron', 'Dayton'],
  'MI': ['Detroit', 'Grand Rapids', 'Warren', 'Sterling Heights', 'Ann Arbor', 'Lansing'],
  'TN': ['Nashville', 'Memphis', 'Knoxville', 'Chattanooga', 'Clarksville'],
  'WA': ['Seattle', 'Spokane', 'Tacoma', 'Vancouver', 'Bellevue', 'Kent'],
  'CO': ['Denver', 'Colorado Springs', 'Aurora', 'Fort Collins', 'Lakewood', 'Boulder'],
  'MA': ['Boston', 'Worcester', 'Springfield', 'Cambridge', 'Lowell'],
  'NV': ['Las Vegas', 'Henderson', 'Reno', 'North Las Vegas', 'Sparks'],
  'IN': ['Indianapolis', 'Fort Wayne', 'Evansville', 'South Bend', 'Carmel'],
  'MO': ['Kansas City', 'St. Louis', 'Springfield', 'Columbia', 'Independence'],
  'MD': ['Baltimore', 'Frederick', 'Rockville', 'Gaithersburg', 'Bowie'],
  'WI': ['Milwaukee', 'Madison', 'Green Bay', 'Kenosha', 'Racine'],
  'MN': ['Minneapolis', 'St. Paul', 'Rochester', 'Duluth', 'Bloomington'],
  'OK': ['Oklahoma City', 'Tulsa', 'Norman', 'Broken Arrow', 'Edmond'],
  'OR': ['Portland', 'Salem', 'Eugene', 'Gresham', 'Hillsboro'],
  'NJ': ['Newark', 'Jersey City', 'Paterson', 'Elizabeth', 'Edison'],
  'VA': ['Virginia Beach', 'Norfolk', 'Chesapeake', 'Richmond', 'Newport News', 'Alexandria'],
  'LA': ['New Orleans', 'Baton Rouge', 'Shreveport', 'Lafayette', 'Lake Charles'],
  'KY': ['Louisville', 'Lexington', 'Bowling Green', 'Owensboro', 'Covington'],
  'SC': ['Charleston', 'Columbia', 'North Charleston', 'Mount Pleasant', 'Greenville'],
  'AL': ['Birmingham', 'Montgomery', 'Huntsville', 'Mobile', 'Tuscaloosa'],
  'UT': ['Salt Lake City', 'West Valley City', 'Provo', 'West Jordan', 'Orem']
};

/**
 * Detect country from address, service areas, or city names
 */
function detectCountry(address, serviceAreas, primaryArea) {
  // Check address postal code format first (most reliable)
  if (address) {
    if (address.addressCountry) {
      return address.addressCountry;
    }
    // Canadian postal code: A1A 1A1
    if (address.postalCode && /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(address.postalCode)) {
      return 'CA';
    }
    // US ZIP: 12345
    if (address.postalCode && /^\d{5}(-\d{4})?$/.test(address.postalCode)) {
      return 'US';
    }
    // Check region for Canadian provinces
    if (address.addressRegion) {
      const region = address.addressRegion.toUpperCase();
      if (CANADIAN_PROVINCES[region] || Object.values(CANADIAN_PROVINCES).some(p => p.toUpperCase() === region)) {
        return 'CA';
      }
      // Check for US states
      if (US_STATES.includes(region)) {
        return 'US';
      }
    }
  }

  // Check service areas for known cities
  const allText = [...serviceAreas, primaryArea || ''].join(' ').toLowerCase();

  // Check Canadian cities first
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

  // Default to US (most common use case)
  return 'US';
}

/**
 * Detect region/province/state from address or service areas
 */
function detectRegion(address, serviceAreas, primaryArea, country) {
  // Use provided region if available
  if (address && address.addressRegion) {
    return address.addressRegion;
  }

  const allText = [...serviceAreas, primaryArea || ''].join(' ').toLowerCase();

  // For Canada, find province based on cities
  if (country === 'CA') {
    for (const [province, cities] of Object.entries(CANADIAN_CITIES)) {
      for (const city of cities) {
        if (allText.includes(city.toLowerCase())) {
          return province;
        }
      }
    }
  }

  // For US, find state based on cities
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
 * Generate a LocalBusiness schema (specifically HVACBusiness for HVAC companies)
 * @param {object} orgInfo - Organization information
 * @param {object} options - Additional options (phone, address, serviceAreas, etc.)
 * @returns {object} - JSON-LD LocalBusiness schema
 */
function generate(orgInfo, options = {}) {
  const schema = {
    '@type': options.businessType || 'HVACBusiness',
    'name': orgInfo.name,
    'url': orgInfo.url,
    '@id': `${orgInfo.url}#localbusiness`
  };

  // Add logo
  if (orgInfo.logo) {
    schema.logo = {
      '@type': 'ImageObject',
      'url': orgInfo.logo,
      '@id': `${orgInfo.url}#logo`
    };
    schema.image = schema.logo;
  }

  // Add contact info
  if (options.phone) {
    schema.telephone = options.phone;
  }

  if (options.email) {
    schema.email = options.email;
  }

  // Parse service areas for use in address and areaServed
  const areas = options.serviceAreas || [];
  const areaServedStr = options.areaServed || '';
  const parsedAreas = areaServedStr ? areaServedStr.split(',').map(a => a.trim()).filter(a => a) : [];
  const allAreas = areas.length > 0 ? areas : parsedAreas;
  const primaryArea = allAreas[0] || '';

  // Add address - REQUIRED by Google for LocalBusiness
  // Build from provided address, derive from service areas, or create minimal address

  // Detect country from various sources
  const detectedCountry = detectCountry(options.address, allAreas, primaryArea);
  const detectedRegion = detectRegion(options.address, allAreas, primaryArea, detectedCountry);

  if (options.address && (options.address.streetAddress || options.address.addressLocality)) {
    // Use provided address
    schema.address = {
      '@type': 'PostalAddress',
      'addressCountry': options.address.addressCountry || detectedCountry
    };
    if (options.address.streetAddress) schema.address.streetAddress = options.address.streetAddress;
    if (options.address.addressLocality) schema.address.addressLocality = options.address.addressLocality;
    if (options.address.addressRegion) {
      schema.address.addressRegion = options.address.addressRegion;
    } else if (detectedRegion) {
      schema.address.addressRegion = detectedRegion;
    }
    if (options.address.postalCode) schema.address.postalCode = options.address.postalCode;
  } else if (primaryArea) {
    // Derive from service areas - parse "City, State" or just "City"
    const parts = primaryArea.split(',').map(p => p.trim());
    schema.address = {
      '@type': 'PostalAddress',
      'addressLocality': parts[0],
      'addressRegion': parts[1] || detectedRegion || '',
      'addressCountry': detectedCountry
    };
  } else {
    // Fallback: Create minimal address from URL domain or use placeholder
    // Google requires address, so we must provide something
    schema.address = {
      '@type': 'PostalAddress',
      'addressCountry': detectedCountry
    };
    // If we can extract location from business name, use it
    if (orgInfo.name && orgInfo.name !== 'Organization') {
      schema.address.addressLocality = orgInfo.name;
    }
    if (detectedRegion) {
      schema.address.addressRegion = detectedRegion;
    }
  }

  // Add service areas - IMPORTANT for Google to understand service coverage
  if (allAreas.length > 1) {
    schema.areaServed = allAreas.map(area => ({
      '@type': 'City',
      'name': area
    }));
  } else if (allAreas.length === 1) {
    schema.areaServed = {
      '@type': 'City',
      'name': allAreas[0]
    };
  } else if (schema.address && schema.address.addressLocality) {
    // If no areaServed but we have a city in address, use that
    schema.areaServed = {
      '@type': 'City',
      'name': schema.address.addressLocality
    };
  }

  // Add opening hours
  if (options.openingHours) {
    schema.openingHoursSpecification = options.openingHours;
  } else {
    // Default for 24/7 emergency service (common for HVAC)
    schema.openingHoursSpecification = {
      '@type': 'OpeningHoursSpecification',
      'dayOfWeek': [
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
      ],
      'opens': '00:00',
      'closes': '23:59'
    };
  }

  // Add price range if provided
  if (options.priceRange) {
    schema.priceRange = options.priceRange;
  }

  // Add same as (social profiles)
  if (options.sameAs && options.sameAs.length > 0) {
    schema.sameAs = options.sameAs;
  }

  // Add aggregate rating if provided
  if (options.rating) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      'ratingValue': options.rating.value,
      'reviewCount': options.rating.count,
      'bestRating': '5',
      'worstRating': '1'
    };
  }

  // Common HVAC services offered
  schema.hasOfferCatalog = {
    '@type': 'OfferCatalog',
    'name': 'HVAC Services',
    'itemListElement': [
      {
        '@type': 'Offer',
        'itemOffered': {
          '@type': 'Service',
          'name': 'Air Conditioning Repair'
        }
      },
      {
        '@type': 'Offer',
        'itemOffered': {
          '@type': 'Service',
          'name': 'AC Installation'
        }
      },
      {
        '@type': 'Offer',
        'itemOffered': {
          '@type': 'Service',
          'name': 'Heating Repair'
        }
      },
      {
        '@type': 'Offer',
        'itemOffered': {
          '@type': 'Service',
          'name': 'Furnace Installation'
        }
      },
      {
        '@type': 'Offer',
        'itemOffered': {
          '@type': 'Service',
          'name': 'HVAC Maintenance'
        }
      }
    ]
  };

  return schema;
}

module.exports = {
  generate
};
