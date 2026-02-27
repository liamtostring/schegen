/**
 * AI Verification Service
 * Uses AI to verify and enhance extracted schema data
 */

const ai = require('./index');

/**
 * Verify all extracted data for a page
 * @param {object} pageData - Scraped page data
 * @param {object} extractedData - Currently extracted schema data
 * @param {object} orgInfo - Organization info
 * @param {string} provider - 'openai' or 'gemini'
 * @param {string} model - Specific model to use
 * @param {string} apiKey - Optional API key (from UI)
 */
async function verifyAll(pageData, extractedData, orgInfo, provider = 'openai', model = null, apiKey = null) {
  const prompt = buildVerificationPrompt(pageData, extractedData, orgInfo);

  const result = await ai.callJSON(provider, prompt, { model, apiKey });

  return {
    provider,
    model: model || ai.getDefaultModel(provider),
    verification: result
  };
}

/**
 * Build the verification prompt
 */
function buildVerificationPrompt(pageData, extractedData, orgInfo) {
  return `Analyze this web page content and verify/enhance the extracted data.

## Page Information
URL: ${pageData.url}
Title: ${pageData.title}
Description: ${pageData.description || 'Not provided'}

## Page Content (first 3000 chars)
${(pageData.content || '').substring(0, 3000)}

## Currently Extracted Data
Page Type: ${extractedData.pageType}
Business Name: ${orgInfo.name || 'Not provided'}
Phone: ${pageData.phone || orgInfo.phone || 'Not found'}
${extractedData.pageType === 'location' ? `Location: ${extractedData.location || 'Not detected'}` : ''}

## Extracted FAQs (${(pageData.faqs || []).length} found)
${(pageData.faqs || []).map((f, i) => `${i + 1}. Q: ${f.question}\n   A: ${f.answer}`).join('\n') || 'None found'}

## Your Task
Analyze the page and respond with JSON containing:

{
  "pageType": {
    "detected": "service|location|article",
    "confidence": 0.0-1.0,
    "reason": "Brief explanation"
  },
  "businessInfo": {
    "nameCorrect": true|false,
    "suggestedName": "Correct name if wrong",
    "phoneFound": "Phone number found on page or null",
    "addressFound": "Address if found or null"
  },
  "location": {
    "city": "City name or null",
    "state": "State abbreviation or null",
    "serviceAreas": ["List of service areas mentioned"],
    "confidence": 0.0-1.0
  },
  "reviews": [
    {
      "text": "Customer review/testimonial text",
      "author": "Author name if found",
      "rating": 5
    }
  ],
  "faqs": {
    "extractedCorrect": true|false,
    "missing": [
      {
        "question": "Question found on page but not extracted",
        "answer": "Answer"
      }
    ],
    "suggested": [
      {
        "question": "Relevant FAQ based on content",
        "answer": "Answer based on page content"
      }
    ]
  },
  "serviceType": {
    "primary": "Main service type (e.g., AC Repair)",
    "category": "HVAC|Plumbing|Electrical|etc",
    "allServices": ["List of all services mentioned"]
  }
}

Important:
- Only include reviews that are actual customer testimonials found on the page
- For suggested FAQs, only suggest if content supports the answer
- Be accurate with location detection
- Confidence scores should reflect certainty

Respond with valid JSON only.`;
}

/**
 * Quick page type verification only
 * @param {string} apiKey - Optional API key (from UI)
 */
async function verifyPageType(pageData, currentType, provider = 'openai', model = null, apiKey = null) {
  const prompt = `Analyze this web page and determine its type.

URL: ${pageData.url}
Title: ${pageData.title}
Current Detection: ${currentType}

Content (first 1500 chars):
${(pageData.content || '').substring(0, 1500)}

Classify as one of:
- "service": A page about a specific service (AC Repair, Heating Installation, etc.)
- "location": A page about serving a specific area (AC Repair in Houston, Dallas HVAC Services)
- "article": A blog post or informational article

Respond with JSON:
{
  "pageType": "service|location|article",
  "confidence": 0.0-1.0,
  "reason": "Brief explanation",
  "locationIfApplicable": "City name if this is a location page"
}`;

  return ai.callJSON(provider, prompt, { model, maxTokens: 500, apiKey });
}

/**
 * Extract reviews/testimonials from page
 * @param {string} apiKey - Optional API key (from UI)
 */
async function extractReviews(pageData, provider = 'openai', model = null, apiKey = null) {
  const prompt = `Find customer reviews and testimonials on this page.

URL: ${pageData.url}
Title: ${pageData.title}

Content:
${(pageData.content || '').substring(0, 4000)}

Find any customer reviews, testimonials, or quotes. Look for:
- Direct customer quotes
- Star ratings
- Review snippets
- Testimonial sections

Respond with JSON:
{
  "reviews": [
    {
      "text": "The exact review text",
      "author": "Customer name if shown",
      "rating": 5,
      "source": "Google|Yelp|Direct|Unknown"
    }
  ],
  "aggregateRating": {
    "value": 4.8,
    "count": 150,
    "found": true|false
  }
}

Only include actual reviews found on the page. If none found, return empty arrays.
Respond with valid JSON only.`;

  return ai.callJSON(provider, prompt, { model, maxTokens: 1500, apiKey });
}

/**
 * Verify and enhance FAQ extraction
 * @param {string} apiKey - Optional API key (from UI)
 */
async function verifyFAQs(pageData, extractedFaqs, provider = 'openai', model = null, apiKey = null) {
  const prompt = `Verify the extracted FAQs and find any that were missed.

URL: ${pageData.url}
Title: ${pageData.title}

Content:
${(pageData.content || '').substring(0, 4000)}

Currently Extracted FAQs:
${extractedFaqs.map((f, i) => `${i + 1}. Q: ${f.question}\n   A: ${f.answer}`).join('\n') || 'None'}

Tasks:
1. Verify extracted FAQs are accurate
2. Find any FAQs on the page that weren't extracted
3. Do NOT make up FAQs - only include what's actually on the page

Respond with JSON:
{
  "verified": [
    {
      "question": "Verified question",
      "answer": "Verified answer",
      "accurate": true|false,
      "correctedAnswer": "If inaccurate, the correct answer"
    }
  ],
  "missed": [
    {
      "question": "FAQ found on page but not extracted",
      "answer": "Answer from page"
    }
  ],
  "totalOnPage": 5
}

Only include FAQs actually present on the page.
Respond with valid JSON only.`;

  return ai.callJSON(provider, prompt, { model, maxTokens: 2000, apiKey });
}

/**
 * Verify schema against Google Rich Results requirements
 * @param {object} schema - The generated schema (with @graph)
 * @param {object} pageData - Original scraped page data
 * @param {string} provider - 'openai' or 'gemini'
 * @param {string} model - Specific model to use
 * @param {string} apiKey - Optional API key (from UI)
 */
async function verifyGoogleCompliance(schema, pageData, provider = 'openai', model = null, apiKey = null) {
  // First, do local validation for required fields
  const localValidation = validateGoogleRequirements(schema);

  // Then, use AI to verify data accuracy and consistency
  const prompt = buildGoogleCompliancePrompt(schema, pageData, localValidation);

  const result = await ai.callJSON(provider, prompt, { model, maxTokens: 2500, apiKey });

  return {
    provider,
    model: model || ai.getDefaultModel(provider),
    localValidation,
    aiVerification: result,
    overallStatus: determineOverallStatus(localValidation, result)
  };
}

/**
 * Local validation against Google Rich Results requirements
 * Based on https://developers.google.com/search/docs/appearance/structured-data
 */
function validateGoogleRequirements(schema) {
  const errors = [];
  const warnings = [];
  const recommendations = [];

  const schemas = schema['@graph'] || [schema];

  for (const s of schemas) {
    const type = s['@type'];

    // LocalBusiness / HVACBusiness validation
    if (type === 'LocalBusiness' || type === 'HVACBusiness' ||
        type === 'Plumber' || type === 'Electrician' || type === 'RoofingContractor') {
      // Required fields
      if (!s.name) errors.push({ type, field: 'name', message: 'LocalBusiness requires a name' });
      if (!s.address) {
        errors.push({ type, field: 'address', message: 'LocalBusiness requires an address (Google Rich Results will fail without it)' });
      } else {
        if (!s.address.addressLocality && !s.address.streetAddress) {
          errors.push({ type, field: 'address.addressLocality', message: 'Address should have at least a city (addressLocality)' });
        }
      }

      // Recommended fields
      if (!s.telephone) warnings.push({ type, field: 'telephone', message: 'Phone number is recommended for LocalBusiness' });
      if (!s.url) warnings.push({ type, field: 'url', message: 'URL is recommended for LocalBusiness' });
      if (!s.image && !s.logo) recommendations.push({ type, field: 'image', message: 'Image/logo helps with rich results display' });
      if (!s.priceRange) recommendations.push({ type, field: 'priceRange', message: 'Adding priceRange (e.g., "$$") can help users' });
      if (!s.aggregateRating) recommendations.push({ type, field: 'aggregateRating', message: 'Adding ratings improves click-through rates' });
    }

    // Service validation
    if (type === 'Service') {
      if (!s.name) errors.push({ type, field: 'name', message: 'Service requires a name' });
      if (!s.provider) warnings.push({ type, field: 'provider', message: 'Service should have a provider' });
      if (!s.description) warnings.push({ type, field: 'description', message: 'Service should have a description' });
      if (s.provider) {
        // Provider address is REQUIRED - Google Rich Results will fail without it
        if (!s.provider.address) {
          errors.push({ type, field: 'provider.address', message: 'Service provider MUST have an address (Google Rich Results will show "Missing field address" error)' });
        } else if (!s.provider.address.addressLocality && !s.provider.address.streetAddress) {
          errors.push({ type, field: 'provider.address.addressLocality', message: 'Provider address should have at least a city (addressLocality)' });
        }
      }
      if (!s.areaServed) recommendations.push({ type, field: 'areaServed', message: 'Adding areaServed helps with local search visibility' });
    }

    // Article validation
    if (type === 'Article' || type === 'BlogPosting' || type === 'NewsArticle') {
      if (!s.headline) errors.push({ type, field: 'headline', message: 'Article requires a headline' });
      if (!s.author) warnings.push({ type, field: 'author', message: 'Article should have an author for E-E-A-T signals' });
      if (!s.datePublished) warnings.push({ type, field: 'datePublished', message: 'Article should have datePublished' });
      if (!s.image) warnings.push({ type, field: 'image', message: 'Article should have an image for rich results' });
      if (!s.publisher) warnings.push({ type, field: 'publisher', message: 'Article should have a publisher' });
    }

    // FAQPage validation
    if (type === 'FAQPage') {
      if (!s.mainEntity || !Array.isArray(s.mainEntity) || s.mainEntity.length === 0) {
        errors.push({ type, field: 'mainEntity', message: 'FAQPage requires at least one Question' });
      } else {
        s.mainEntity.forEach((q, i) => {
          if (!q.name) errors.push({ type, field: `mainEntity[${i}].name`, message: `FAQ ${i + 1} missing question text` });
          if (!q.acceptedAnswer || !q.acceptedAnswer.text) {
            errors.push({ type, field: `mainEntity[${i}].acceptedAnswer`, message: `FAQ ${i + 1} missing answer` });
          }
        });
      }
    }

    // BreadcrumbList validation
    if (type === 'BreadcrumbList') {
      if (!s.itemListElement || s.itemListElement.length < 2) {
        warnings.push({ type, field: 'itemListElement', message: 'BreadcrumbList should have at least 2 items' });
      }
    }

    // Review validation (if present)
    if (type === 'Review') {
      if (!s.author) errors.push({ type, field: 'author', message: 'Review requires an author' });
      if (!s.reviewRating) warnings.push({ type, field: 'reviewRating', message: 'Review should have a rating' });
      if (!s.itemReviewed) warnings.push({ type, field: 'itemReviewed', message: 'Review should specify what is being reviewed' });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    recommendations,
    schemaTypes: schemas.map(s => s['@type'])
  };
}

/**
 * Build prompt for AI to verify data accuracy
 */
function buildGoogleCompliancePrompt(schema, pageData, localValidation) {
  const schemaStr = JSON.stringify(schema, null, 2);

  return `You are a Google Rich Results expert. Analyze this JSON-LD schema for Google Search compliance.

## Generated Schema
\`\`\`json
${schemaStr.substring(0, 4000)}
\`\`\`

## Original Page Data
URL: ${pageData.url}
Title: ${pageData.title}
Description: ${pageData.description || 'N/A'}
Phone found: ${pageData.phone || 'N/A'}
Service Areas found: ${(pageData.serviceAreas || []).join(', ') || 'N/A'}

## Page Content (for verification)
${(pageData.content || '').substring(0, 2000)}

## Local Validation Results
Errors: ${localValidation.errors.length}
Warnings: ${localValidation.warnings.length}
${localValidation.errors.map(e => `- ERROR: ${e.message}`).join('\n')}
${localValidation.warnings.map(w => `- WARNING: ${w.message}`).join('\n')}

## Your Task
Verify the schema data is accurate, consistent, and Google-compliant. Check:
1. Is the business name accurate according to the page?
2. Is the address/location information correct and complete?
3. Are the service areas actually mentioned on the page?
4. Is the phone number correct (if shown)?
5. Are the FAQs (if any) accurate to the page content?
6. Is the page type (Service/Article/Location) correctly identified?
7. Will this schema pass Google Rich Results Test?

Respond with JSON:
{
  "googleCompliant": true|false,
  "richResultsEligible": {
    "LocalBusiness": true|false,
    "FAQPage": true|false,
    "BreadcrumbList": true|false,
    "Service": true|false,
    "Article": true|false
  },
  "dataAccuracy": {
    "businessName": { "accurate": true|false, "issue": "description if inaccurate" },
    "address": { "accurate": true|false, "issue": "description if inaccurate", "suggestion": "corrected value" },
    "phone": { "accurate": true|false, "found": "phone if found on page" },
    "serviceAreas": { "accurate": true|false, "verified": ["list of verified areas"], "notOnPage": ["areas not found"] },
    "faqs": { "accurate": true|false, "fabricatedCount": 0, "issues": [] }
  },
  "criticalFixes": [
    { "field": "field.path", "issue": "what's wrong", "fix": "how to fix it" }
  ],
  "recommendations": [
    { "field": "field.path", "suggestion": "improvement suggestion" }
  ],
  "confidence": 0.0-1.0,
  "summary": "Brief overall assessment"
}

Only report real issues. If the data is accurate, say so.
Respond with valid JSON only.`;
}

/**
 * Determine overall verification status
 */
function determineOverallStatus(localValidation, aiResult) {
  const hasLocalErrors = localValidation.errors.length > 0;
  const hasCriticalFixes = aiResult.criticalFixes && aiResult.criticalFixes.length > 0;
  const isGoogleCompliant = aiResult.googleCompliant;

  if (hasLocalErrors || hasCriticalFixes) {
    return {
      status: 'needs_fixes',
      message: 'Schema has issues that need to be fixed before publishing',
      canPublish: false
    };
  }

  if (localValidation.warnings.length > 0 || (aiResult.recommendations && aiResult.recommendations.length > 0)) {
    return {
      status: 'warnings',
      message: 'Schema is valid but has recommendations for improvement',
      canPublish: true
    };
  }

  if (isGoogleCompliant) {
    return {
      status: 'verified',
      message: 'Schema is Google-compliant and ready to publish',
      canPublish: true
    };
  }

  return {
    status: 'unknown',
    message: 'Could not determine compliance status',
    canPublish: false
  };
}

module.exports = {
  verifyAll,
  verifyPageType,
  extractReviews,
  verifyFAQs,
  verifyGoogleCompliance,
  validateGoogleRequirements
};
