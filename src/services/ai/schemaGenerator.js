/**
 * AI-powered Schema Generator
 * Reads page content and generates RankMath-compliant schemas
 */

const aiService = require('./index');

const SCHEMA_PROMPT = `You are an SEO expert specializing in structured data. Analyze this web page and create ALL appropriate JSON-LD schemas.

## Page Information
URL: {url}
Title: {title}
Description: {description}
WordPress Post Type: {wpPostType}
Detected Page Type: {pageType}

## Page Content
{content}

## Extracted FAQs from page
{faqs}

## Breadcrumbs from URL
{breadcrumbs}

## Organization Info
Name: {orgName}
URL: {orgUrl}
Phone: {phone}
Areas Served: {areasServed}
Business Type: {businessType}
Address: {address}
Logo: {logo}
OG Image / Featured Image: {image}
Social Profiles (sameAs): {sameAs}

## Page Type Rules
Use BOTH the WordPress Post Type and content to determine the correct page type:

1. **WordPress "post"** → ARTICLE/BLOG page. Use Article schema (headline, datePublished, author, publisher). Do NOT use Service schema.
2. **WordPress "page"** → Usually a SERVICE page. Use Service schema. EXCEPT:
   - "About Us", "About", "Our Story", "Our Team" pages → Use WebPage or AboutPage schema only, NOT Service schema.
   - Homepage (root URL or title contains "Home") → Use WebPage + HVACBusiness, NOT Service schema.
3. **If WordPress post type is unknown** → Detect from content:
   - Has publish date + author + blog-like URL → article
   - Describes a specific service → service
   - Targets a geographic area → location

## @id Linking Rules (CRITICAL — prevents duplicate data)

Define each entity ONCE with an @id, then reference it elsewhere using ONLY { "@id": "..." }:

- **HVACBusiness** gets \`"@id": "#business"\`. Include name, url, telephone, address, areaServed, logo, sameAs. Define it ONCE as a standalone schema.
- **Service.provider** MUST be exactly \`{ "@id": "#business" }\` — NOTHING else. No address, no telephone, no name alongside the @id. A reference is ONLY the @id key.
- **Article.publisher** MUST be exactly \`{ "@id": "#business" }\` — same rule.
- **WebSite** gets \`"@id": "#website"\`.
- **WebPage** gets \`"@id": "#webpage"\` and references WebSite via \`"isPartOf": { "@id": "#website" }\`.
- **WebPage** should include \`"about": { "@id": "#business" }\` to connect the page to the business entity.
- **FAQPage** should include \`"isPartOf": { "@id": "#webpage" }\` to connect FAQs to the page.

## Image Rules

- \`logo\` field goes on HVACBusiness (the organization's logo URL). Use the Logo value from Organization Info above.
- \`image\` field on Service (or Article) should use the OG Image / Featured Image value from above — this is the descriptive page image.
- If either URL is empty, omit that field rather than guessing.

## sameAs (Social Profiles)

- Include a \`sameAs\` array on HVACBusiness with all Social Profile URLs listed above.
- If none provided, omit sameAs entirely.

## Schemas to Create

For SERVICE pages:
1. **HVACBusiness** — @id "#business", name, url, telephone, address, areaServed, logo, sameAs, openingHours, priceRange. If the content mentions a founding year (e.g. "since 2007"), include \`foundingDate\`.
2. **Service** — name, description, serviceType, provider: { "@id": "#business" }, areaServed, image (og/featured image)
   - \`serviceType\` MUST match the scope of the Service name (e.g. if name is "Heating Services", serviceType should be "Heating", NOT "HVAC Services")
   - If the page describes multiple sub-services (e.g. furnace installation, repair, and maintenance), add \`hasOfferCatalog\` with an OfferCatalog listing each sub-service as an Offer with itemOffered.
   - Deduplicate similar sub-services: "Furnace Tune-Up" and "Furnace Maintenance" are the same — pick one or differentiate clearly (e.g. "Annual Maintenance Plan" vs "One-Time Tune-Up").
3. **FAQPage** — ONLY if FAQs extracted above (use them EXACTLY, never invent). Include isPartOf: { "@id": "#webpage" }
4. **BreadcrumbList** — from URL structure
5. **WebSite** — @id "#website", name, url
6. **WebPage** — @id "#webpage", name, description, url, isPartOf: { "@id": "#website" }, about: { "@id": "#business" }

For ARTICLE/BLOG pages:
1. **HVACBusiness** — same as above (with @id "#business", foundingDate if mentioned)
2. **Article** — headline, datePublished, dateModified, author, publisher: { "@id": "#business" }, image (og/featured image)
3. **FAQPage** — ONLY if FAQs extracted. Include isPartOf: { "@id": "#webpage" }
4. **BreadcrumbList** — from URL structure
5. **WebSite** — @id "#website", name, url
6. **WebPage** — @id "#webpage", name, description, url, isPartOf: { "@id": "#website" }, about: { "@id": "#business" }

For ABOUT pages:
1. **HVACBusiness** — with full details and @id "#business" (foundingDate if mentioned)
2. **BreadcrumbList** — from URL structure
3. **WebSite** — @id "#website", name, url
4. **WebPage** — @id "#webpage", name, description, url, isPartOf: { "@id": "#website" }, about: { "@id": "#business" }

For HOMEPAGE:
1. **HVACBusiness** — with full details and @id "#business" (foundingDate if mentioned)
2. **WebSite** — @id "#website", name, url
3. **WebPage** — @id "#webpage", name, description, url, isPartOf: { "@id": "#website" }, about: { "@id": "#business" }

## Output Format
Return ONLY valid JSON (no markdown):
{
  "pageType": "service|article|location|about|homepage",
  "schemas": [
    { "type": "HVACBusiness", "schema": { "@context": "https://schema.org", "@type": "HVACBusiness", "@id": "#business", ... } },
    { "type": "Service", "schema": { "@context": "https://schema.org", "@type": "Service", "provider": { "@id": "#business" }, ... } },
    { "type": "FAQPage", "schema": { ... } },
    { "type": "BreadcrumbList", "schema": { ... } },
    { "type": "WebSite", "schema": { "@context": "https://schema.org", "@type": "WebSite", "@id": "#website", ... } },
    { "type": "WebPage", "schema": { "@context": "https://schema.org", "@type": "WebPage", "@id": "#webpage", "isPartOf": { "@id": "#website" }, ... } }
  ],
  "summary": "Description of schemas created and why",
  "confidence": 0.95
}

CRITICAL RULES:
- Include @context: "https://schema.org" in EACH schema
- @id references must be PURE — \`{ "@id": "#business" }\` with NO other properties. This applies to Service.provider, Article.publisher, WebPage.isPartOf, WebPage.about, FAQPage.isPartOf
- FAQs: use ONLY extracted FAQs, NEVER invent new ones
- If no FAQs extracted, do NOT include FAQPage
- All data must come from the page content - do not fabricate
- addressCountry should be "CA" for Canadian addresses (ON, BC, AB provinces)
- Make all schemas Google Rich Results compliant
- NEVER truncate or shorten the page title — copy the EXACT full title string from "Title:" above as WebPage.name, character for character
- WordPress "post" = Article schema. WordPress "page" = Service schema (unless About/Home page)
- For areaServed, use \`@type: "City"\` instead of \`@type: "Place"\` for municipalities — City is more semantically accurate`;

/**
 * Safe string replacement that doesn't interpret $ patterns.
 * JavaScript's String.replace() treats $&, $', $` as special in replacement strings.
 * Page content with $ signs (prices, JS code) can silently corrupt the prompt.
 */
function safeReplace(str, search, replacement) {
  const idx = str.indexOf(search);
  if (idx === -1) return str;
  return str.substring(0, idx) + replacement + str.substring(idx + search.length);
}

/**
 * Generate schemas using AI
 * @param {object} pageData - Scraped page data
 * @param {object} orgInfo - Organization info
 * @param {object} options - AI options (provider, model, apiKey)
 */
async function generateSchemas(pageData, orgInfo, options = {}) {
  const { provider = 'gemini', model, apiKey, pageType } = options;

  // Normalize orgInfo field names (frontend sends orgName/orgUrl, we need name/url)
  const org = {
    name: orgInfo.name || orgInfo.orgName || '',
    url: orgInfo.url || orgInfo.orgUrl || pageData.url || '',
    phone: orgInfo.phone || pageData.phone || '',
    areaServed: orgInfo.areaServed || (pageData.serviceAreas || []).join(', ') || '',
    address: orgInfo.address || null,
    businessType: orgInfo.businessType || 'HVACBusiness',
    logo: orgInfo.orgLogo || orgInfo.logo || '',
    image: orgInfo.ogImage || pageData.featuredImage || '',
    sameAs: Array.isArray(orgInfo.sameAs) ? orgInfo.sameAs.filter(u => u) : []
  };

  // Determine WordPress post type from scraped data
  const wpPostType = pageData.wordpressInfo?.postType || 'unknown';

  // Format extracted FAQs for the prompt
  const faqsText = (pageData.faqs && pageData.faqs.length > 0)
    ? pageData.faqs.map((f, i) => `${i + 1}. Q: ${f.question}\n   A: ${f.answer}`).join('\n')
    : 'None found on page';

  // Format breadcrumbs from URL
  const urlPath = new URL(pageData.url || 'https://example.com').pathname;
  const breadcrumbsText = urlPath.split('/').filter(p => p).map((p, i, arr) => {
    const name = p.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `${i + 1}. ${name}`;
  }).join('\n') || 'Home';

  // Format address
  const addressText = org.address
    ? (typeof org.address === 'string' ? org.address : JSON.stringify(org.address))
    : 'Not provided';

  // Get page content with fallback to textContent
  const content = truncateContent(pageData.content || pageData.textContent || '', 4000);

  // Build the prompt using safeReplace to prevent $ pattern corruption
  let prompt = SCHEMA_PROMPT;
  prompt = safeReplace(prompt, '{url}', pageData.url || '');
  prompt = safeReplace(prompt, '{title}', pageData.title || '');
  prompt = safeReplace(prompt, '{description}', pageData.description || '');
  prompt = safeReplace(prompt, '{wpPostType}', wpPostType);
  prompt = safeReplace(prompt, '{pageType}', pageType || 'auto-detect');
  prompt = safeReplace(prompt, '{content}', content);
  prompt = safeReplace(prompt, '{faqs}', faqsText);
  prompt = safeReplace(prompt, '{breadcrumbs}', breadcrumbsText);
  prompt = safeReplace(prompt, '{orgName}', org.name);
  prompt = safeReplace(prompt, '{orgUrl}', org.url);
  prompt = safeReplace(prompt, '{phone}', org.phone);
  prompt = safeReplace(prompt, '{areasServed}', org.areaServed);
  prompt = safeReplace(prompt, '{address}', addressText);
  prompt = safeReplace(prompt, '{businessType}', org.businessType);
  prompt = safeReplace(prompt, '{logo}', org.logo);
  prompt = safeReplace(prompt, '{image}', org.image);
  prompt = safeReplace(prompt, '{sameAs}', org.sameAs.length > 0 ? org.sameAs.join('\n') : 'None provided');

  console.log(`[AI Schema] Building prompt: url=${pageData.url} wpType=${wpPostType} pageType=${pageType||'auto'} title="${(pageData.title||'').substring(0,50)}" contentLen=${content.length} faqCount=${(pageData.faqs||[]).length} provider=${provider}`);

  try {
    const response = await aiService.call(provider, prompt, {
      model,
      apiKey,
      maxTokens: 8192
    });

    console.log(`[AI Schema] AI response received: ${response.length} chars`);

    // Parse the AI response
    const result = parseAIResponse(response);

    if (!result.schemas || result.schemas.length === 0) {
      console.log(`[AI Schema] WARNING: 0 schemas parsed. AI response (first 800 chars):\n${response.substring(0, 800)}`);
    } else {
      console.log(`[AI Schema] Parsed ${result.schemas.length} schemas: ${result.schemas.map(s => s.type).join(', ')}`);
    }

    // Post-process: ensure Service providers have complete addresses
    const processedSchemas = ensureProviderAddresses(result.schemas || [], orgInfo, pageData);

    return {
      success: true,
      schemas: processedSchemas,
      summary: result.summary || 'Schemas generated',
      confidence: result.confidence || 0.8,
      tokensUsed: 0  // Token tracking handled by provider
    };
  } catch (error) {
    console.error(`[AI Schema] ERROR: ${error.message}`);
    return {
      success: false,
      error: error.message,
      schemas: []
    };
  }
}

/**
 * Strip a polluted @id reference down to just { "@id": "..." }.
 * AI sometimes adds extra properties (address, telephone, name) alongside @id — this enforces purity.
 */
function cleanIdReference(obj) {
  if (obj && typeof obj === 'object' && obj['@id']) {
    return { '@id': obj['@id'] };
  }
  return obj;
}

/**
 * Post-process AI-generated schemas:
 * 1. Enforce pure @id references (strip polluted ones)
 * 2. Ensure standalone business entities have complete addresses
 */
function ensureProviderAddresses(schemas, orgInfo, pageData) {
  if (!schemas || !Array.isArray(schemas)) return schemas;

  // Detect country from available data
  const serviceAreas = pageData.serviceAreas || [];
  const areaServed = orgInfo.areaServed || '';
  const allAreas = areaServed ? areaServed.split(',').map(a => a.trim()).filter(a => a) : serviceAreas;

  // Canadian cities for detection
  const canadianCities = ['Hamilton', 'Toronto', 'Ottawa', 'Burlington', 'Oakville', 'Mississauga',
    'Brampton', 'Ancaster', 'Dundas', 'Stoney Creek', 'Waterdown', 'Grimsby', 'Vancouver',
    'Calgary', 'Edmonton', 'Montreal', 'Kitchener', 'Waterloo', 'London', 'Guelph', 'Cambridge'];

  // Detect country from service areas
  let detectedCountry = 'CA'; // Default for this app
  let detectedRegion = 'ON';
  let detectedCity = allAreas[0] || '';

  const allText = allAreas.join(' ').toLowerCase();
  for (const city of canadianCities) {
    if (allText.includes(city.toLowerCase())) {
      detectedCity = city;
      detectedCountry = 'CA';
      // Most of these are Ontario cities
      if (['Vancouver'].includes(city)) detectedRegion = 'BC';
      else if (['Calgary', 'Edmonton'].includes(city)) detectedRegion = 'AB';
      else if (['Montreal'].includes(city)) detectedRegion = 'QC';
      else detectedRegion = 'ON';
      break;
    }
  }

  return schemas.map(item => {
    const schema = item.schema;
    if (!schema) return item;

    // --- Enforce pure @id references across all schema types ---

    // Service.provider: if it has @id, strip everything else
    if (schema['@type'] === 'Service' && schema.provider && schema.provider['@id']) {
      schema.provider = cleanIdReference(schema.provider);
    }

    // Article.publisher: if it has @id, strip everything else
    if (schema['@type'] === 'Article' && schema.publisher && schema.publisher['@id']) {
      schema.publisher = cleanIdReference(schema.publisher);
    }

    // WebPage.isPartOf and WebPage.about: enforce pure @id
    if (schema['@type'] === 'WebPage') {
      if (schema.isPartOf && schema.isPartOf['@id']) {
        schema.isPartOf = cleanIdReference(schema.isPartOf);
      }
      if (schema.about && schema.about['@id']) {
        schema.about = cleanIdReference(schema.about);
      }
    }

    // FAQPage.isPartOf: enforce pure @id
    if (schema['@type'] === 'FAQPage' && schema.isPartOf && schema.isPartOf['@id']) {
      schema.isPartOf = cleanIdReference(schema.isPartOf);
    }

    // --- Ensure standalone business entities have complete addresses ---

    if (schema['@type'] === 'HVACBusiness' || schema['@type'] === 'LocalBusiness') {
      if (!schema.address) {
        schema.address = {
          '@type': 'PostalAddress',
          'addressLocality': detectedCity || orgInfo.name,
          'addressRegion': detectedRegion,
          'addressCountry': detectedCountry
        };
      } else if (!schema.address.addressLocality && !schema.address.streetAddress) {
        schema.address.addressLocality = detectedCity || orgInfo.name;
        if (!schema.address.addressRegion) {
          schema.address.addressRegion = detectedRegion;
        }
        if (!schema.address.addressCountry) {
          schema.address.addressCountry = detectedCountry;
        }
      }

      if (!schema.telephone && (orgInfo.phone || pageData.phone)) {
        schema.telephone = orgInfo.phone || pageData.phone;
      }
    }

    return item;
  });
}

/**
 * Parse AI response to extract JSON
 */
function parseAIResponse(text) {
  // Try to extract JSON from the response
  let jsonStr = text;

  // Remove markdown code blocks if present
  if (text.includes('```json')) {
    jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  } else if (text.includes('```')) {
    jsonStr = text.replace(/```\n?/g, '');
  }

  // Find the JSON object using balanced brace matching (not greedy regex)
  const extracted = extractBalancedJSON(jsonStr);
  if (extracted) {
    jsonStr = extracted;
  }

  try {
    const parsed = JSON.parse(jsonStr.trim());

    // Normalize schemas to always use { type, schema } wrapper format
    let schemas = parsed.schemas;

    // Check alternate property names the AI might use
    if (!schemas || !Array.isArray(schemas)) {
      schemas = parsed.schema || parsed.results || parsed.data || parsed['@graph'];
      if (schemas && !Array.isArray(schemas)) schemas = [schemas];
    }

    if (schemas && Array.isArray(schemas) && schemas.length > 0) {
      // Normalize each schema item to { type, schema } format
      const normalized = schemas.map(item => {
        // Already in expected format: { type: "Service", schema: { "@type": "Service", ... } }
        if (item.type && item.schema && typeof item.schema === 'object') {
          return item;
        }
        // Raw schema object: { "@type": "Service", "@context": "...", ... }
        if (item['@type']) {
          return { type: item['@type'], schema: item };
        }
        // Wrapped differently: { schemaType: "Service", data: { ... } }
        if (item.schemaType && item.data) {
          return { type: item.schemaType, schema: item.data };
        }
        // Unknown format — wrap as-is
        return { type: 'Thing', schema: item };
      });

      console.log(`[AI Schema] Normalized ${normalized.length} schemas from AI response`);
      return {
        ...parsed,
        schemas: normalized
      };
    }

    // AI might return a single schema at top level
    if (parsed['@type'] || parsed['@graph']) {
      console.log('[AI Schema] Response is raw schema at top level, wrapping it');
      if (parsed['@graph'] && Array.isArray(parsed['@graph'])) {
        const wrapped = parsed['@graph'].map(s => ({ type: s['@type'] || 'Thing', schema: s }));
        return { schemas: wrapped, summary: 'Extracted from @graph', confidence: 0.7 };
      }
      return { schemas: [{ type: parsed['@type'] || 'Thing', schema: parsed }], summary: 'Single schema returned', confidence: 0.7 };
    }

    // Nothing recognizable — log and return empty
    console.log(`[AI Schema] Parsed JSON but no schemas found. Keys: ${Object.keys(parsed).join(', ')}`);
    console.log(`[AI Schema] Full parsed response: ${JSON.stringify(parsed).substring(0, 800)}`);
    return { ...parsed, schemas: [] };
  } catch (e) {
    console.error(`[AI Schema] Failed to parse AI response as JSON: ${e.message}`);
    console.error(`[AI Schema] Attempted to parse (first 500 chars): ${jsonStr.substring(0, 500)}`);
    return { schemas: [], summary: 'Failed to parse response', confidence: 0 };
  }
}

/**
 * Extract balanced JSON object from text using brace counting.
 * More reliable than greedy regex which captures too much if there's trailing text with braces.
 */
function extractBalancedJSON(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return text.substring(start, i + 1);
        }
      }
    }
  }

  // Fallback: return everything from first { (unbalanced but try anyway)
  return text.substring(start);
}

/**
 * Truncate content to fit in prompt
 */
function truncateContent(content, maxLength) {
  if (!content) return '';
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength) + '...[truncated]';
}

/**
 * Generate FAQPage schema from extracted FAQs
 */
function generateFAQSchema(faqs, pageUrl) {
  if (!faqs || faqs.length === 0) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  };
}

module.exports = {
  generateSchemas,
  generateFAQSchema,
  parseAIResponse
};
