const express = require('express');
const router = express.Router();

const pageScraper = require('../services/pageScraper');
const pageTypeDetector = require('../services/pageTypeDetector');
const schemaGenerator = require('../services/schemaGenerator');
const wordpressClient = require('../services/wordpressClient');
const databaseClient = require('../services/databaseClient');
const rankMathClient = require('../services/rankMathClient');
const aiService = require('../services/ai');
const aiVerifier = require('../services/ai/verifier');
const aiSchemaGenerator = require('../services/ai/schemaGenerator');
const logger = require('../services/logger');
const schemaDiff = require('../services/schemaDiff');

// Store for active jobs (in production, use Redis or similar)
const jobs = new Map();

// Cache for auto-detected org info (avoids re-scraping homepage for every URL in bulk)
// Key: hostname, Value: { data, timestamp }
const orgInfoCache = new Map();
const ORG_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Get available AI providers and models
router.get('/ai/providers', (req, res) => {
  try {
    const providers = aiService.getAvailableProviders();
    res.json({ success: true, providers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// AI-powered schema generation
router.post('/ai/generate-schema', async (req, res) => {
  try {
    const { url, orgInfo, provider, model, apiKey, skipVerification, siteUrl, secretToken } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Helper config for fetching via WP plugin (bypasses CDN/WAF)
    const helperConfig = siteUrl && secretToken ? { siteUrl, secretToken } : null;

    // Scrape the page
    const pageData = await pageScraper.scrape(url, { helperConfig });
    const pageType = pageTypeDetector.detect(url, pageData);

    console.log(`[ai/generate-schema] url=${url} helperConfig=${!!helperConfig} wpType=${pageData.wordpressInfo?.postType} detectedType=${pageType} title="${pageData.title}" contentLen=${(pageData.content||'').length} faqCount=${(pageData.faqs||[]).length}`);

    // Generate schemas using AI (pass detected pageType so AI knows post vs page)
    const result = await aiSchemaGenerator.generateSchemas(pageData, orgInfo || {}, {
      provider: provider || 'gemini',
      model,
      apiKey,
      pageType
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Log the generation
    logger.log('ai_schema_generated', {
      url,
      provider: provider || 'gemini',
      schemaCount: result.schemas.length,
      tokens: result.tokensUsed
    });

    // AUTO-VERIFY: AI verification for logic, coherence, and accuracy
    let verification = null;
    if (!skipVerification && result.schemas.length > 0) {
      try {
        // Build the full schema for verification
        const fullSchema = {
          '@context': 'https://schema.org',
          '@graph': result.schemas.map(s => s.schema)
        };

        verification = await aiVerifier.verifyGoogleCompliance(
          fullSchema,
          pageData,
          provider || 'gemini',
          model,
          apiKey
        );

        // Log verification
        logger.log('ai_schema_verified', {
          url,
          googleCompliant: verification.aiVerification?.googleCompliant,
          hasIssues: verification.aiVerification?.criticalFixes?.length > 0
        });
      } catch (verifyError) {
        logger.log('ai_verification_error', { url, error: verifyError.message });
        verification = { error: verifyError.message };
      }
    }

    res.json({
      success: true,
      url,
      pageType,
      pageData: {
        title: pageData.title,
        description: pageData.description,
        faqCount: pageData.faqs?.length || 0
      },
      schemas: result.schemas,
      summary: result.summary,
      confidence: result.confidence,
      tokensUsed: result.tokensUsed,
      verification: verification
    });
  } catch (error) {
    logger.log('ai_schema_generate_error', { url: req.body.url, error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Batch AI schema generation for multiple URLs
router.post('/ai/generate-schemas-batch', async (req, res) => {
  try {
    const { urls, orgInfo, provider, model, apiKey, siteUrl, secretToken } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'URLs array is required' });
    }

    // Helper config for fetching via WP plugin (bypasses CDN/WAF)
    const helperConfig = siteUrl && secretToken ? { siteUrl, secretToken } : null;

    const results = [];
    let totalTokens = 0;

    for (const url of urls) {
      try {
        const pageData = await pageScraper.scrape(url, { helperConfig });
        const pageType = pageTypeDetector.detect(url, pageData);

        const result = await aiSchemaGenerator.generateSchemas(pageData, orgInfo || {}, {
          provider: provider || 'openai',
          model,
          apiKey,
          pageType
        });

        totalTokens += result.tokensUsed || 0;

        results.push({
          url,
          success: result.success,
          pageType,
          pageData: {
            title: pageData.title,
            description: pageData.description,
            faqCount: pageData.faqs?.length || 0
          },
          schemas: result.schemas || [],
          summary: result.summary,
          error: result.error
        });
      } catch (error) {
        results.push({
          url,
          success: false,
          error: error.message,
          schemas: []
        });
      }
    }

    // Log batch generation
    logger.log('ai_schema_batch_generated', {
      urlCount: urls.length,
      successCount: results.filter(r => r.success).length,
      totalTokens,
      provider: provider || 'openai'
    });

    if (totalTokens > 0) {
      logger.logTokens(provider || 'openai', totalTokens, 'batch_schema_generation');
    }

    res.json({
      success: true,
      results,
      totalTokens
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify page data with AI
router.post('/ai/verify', async (req, res) => {
  try {
    const { url, pageData, extractedData, orgInfo, provider, model, apiKey } = req.body;

    if (!url && !pageData) {
      return res.status(400).json({ error: 'URL or pageData required' });
    }

    // Scrape page if not provided
    let data = pageData;
    if (!data) {
      data = await pageScraper.scrape(url);
    }

    const pageType = extractedData?.pageType || pageTypeDetector.detect(url || data.url, data);

    const result = await aiVerifier.verifyAll(
      data,
      { pageType, ...extractedData },
      orgInfo || {},
      provider || 'openai',
      model,
      apiKey  // Pass API key from request
    );

    // Log AI verification and token usage
    const tokens = result.tokensUsed || result.usage?.total_tokens || 0;
    if (tokens > 0) {
      logger.logTokens(provider || 'openai', tokens, 'verification');
    }
    logger.log('ai_verification', {
      url: url || data?.url,
      provider: provider || 'openai',
      model,
      tokens
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.log('ai_verification_error', { url: req.body.url, error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Quick page type verification
router.post('/ai/verify-page-type', async (req, res) => {
  try {
    const { url, pageData, currentType, provider, model, apiKey } = req.body;

    if (!url && !pageData) {
      return res.status(400).json({ error: 'URL or pageData required' });
    }

    let data = pageData;
    if (!data) {
      data = await pageScraper.scrape(url);
    }

    const result = await aiVerifier.verifyPageType(
      data,
      currentType || 'unknown',
      provider || 'openai',
      model,
      apiKey  // Pass API key from request
    );

    res.json({
      success: true,
      verification: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Extract reviews with AI
router.post('/ai/extract-reviews', async (req, res) => {
  try {
    const { url, pageData, provider, model, apiKey } = req.body;

    if (!url && !pageData) {
      return res.status(400).json({ error: 'URL or pageData required' });
    }

    let data = pageData;
    if (!data) {
      data = await pageScraper.scrape(url);
    }

    const result = await aiVerifier.extractReviews(data, provider || 'openai', model, apiKey);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify schema against Google Rich Results requirements
router.post('/ai/verify-google-compliance', async (req, res) => {
  try {
    const { schema, pageData, url, provider, model, apiKey } = req.body;

    if (!schema) {
      return res.status(400).json({ error: 'Schema is required' });
    }

    // If no pageData provided but URL given, scrape it
    let data = pageData;
    if (!data && url) {
      data = await pageScraper.scrape(url);
    }

    if (!data) {
      return res.status(400).json({ error: 'pageData or url required for verification' });
    }

    const result = await aiVerifier.verifyGoogleCompliance(
      schema,
      data,
      provider || 'openai',
      model,
      apiKey
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Quick local validation (no AI, instant response)
router.post('/validate-schema', (req, res) => {
  try {
    const { schema } = req.body;

    if (!schema) {
      return res.status(400).json({ error: 'Schema is required' });
    }

    const validation = aiVerifier.validateGoogleRequirements(schema);

    res.json({
      success: true,
      validation
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify FAQs with AI
router.post('/ai/verify-faqs', async (req, res) => {
  try {
    const { url, pageData, extractedFaqs, provider, model, apiKey } = req.body;

    if (!url && !pageData) {
      return res.status(400).json({ error: 'URL or pageData required' });
    }

    let data = pageData;
    if (!data) {
      data = await pageScraper.scrape(url);
    }

    const faqs = extractedFaqs || data.faqs || [];
    const result = await aiVerifier.verifyFAQs(data, faqs, provider || 'openai', model, apiKey);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Auto-detect organization info from a URL
router.post('/detect-org-info', async (req, res) => {
  try {
    const { url, provider, apiKey, model, siteUrl, secretToken } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Normalize to homepage
    const urlObj = new URL(url);
    const homepageUrl = `${urlObj.protocol}//${urlObj.host}`;

    // Helper config for fetching via WP plugin (bypasses CDN/WAF)
    const helperConfig = siteUrl && secretToken ? { siteUrl, secretToken } : null;

    let orgInfo;

    // If AI is configured, use AI-powered extraction
    if (provider && apiKey) {
      const pageText = await pageScraper.fetchPageText(homepageUrl, helperConfig);

      const prompt = `You are extracting business/organization info from a website. The content below includes HTML METADATA (meta tags, image URLs, link hrefs, JSON-LD schemas) and text from key page sections.

IMPORTANT extraction rules:
- For "logo": look in HTML METADATA for "Logo image URL" or og:image — return the full absolute URL
- For "phone": look in HTML METADATA for "Phone:" entries, or find phone numbers in text
- For "socialProfiles": look in HTML METADATA for "Social/directory link:" entries — return the full URLs
- For "address": check JSON-LD schemas first, then CONTACT/ADDRESS and FOOTER sections
- For "serviceAreas": look for city/area lists in FOOTER or page text (e.g. "Serving X, Y, Z" or listed service areas)
- If a JSON-LD schema is present, prefer its structured data for name, phone, address, etc.

Return ONLY valid JSON with these exact fields (use null for any field not found):

{
  "name": "business name",
  "phone": "primary phone number",
  "logo": "full absolute URL to logo image",
  "address": {
    "streetAddress": "street address",
    "addressLocality": "city",
    "addressRegion": "state/province abbreviation",
    "postalCode": "zip/postal code",
    "addressCountry": "2-letter country code (US, CA, etc.)"
  },
  "serviceAreas": ["city or area names they serve"],
  "socialProfiles": ["full social media / directory URLs"],
  "businessType": "one of: HVACBusiness, Plumber, Electrician, Roofer, GeneralContractor, HomeAndConstructionBusiness, LocalBusiness"
}

Website URL: ${homepageUrl}

${pageText}`;

      const aiResult = await aiService.callJSON(provider, prompt, {
        model,
        apiKey,
        maxTokens: 2000
      });

      // Normalize AI response — strip nulls and empty values
      orgInfo = {
        name: aiResult.name || '',
        url: homepageUrl,
        logo: aiResult.logo || '',
        phone: aiResult.phone || '',
        address: aiResult.address && (aiResult.address.streetAddress || aiResult.address.addressLocality)
          ? aiResult.address
          : null,
        serviceAreas: Array.isArray(aiResult.serviceAreas) ? aiResult.serviceAreas.filter(Boolean) : [],
        socialProfiles: Array.isArray(aiResult.socialProfiles) ? aiResult.socialProfiles.filter(Boolean) : [],
        businessType: aiResult.businessType || 'LocalBusiness'
      };
    } else {
      // Fallback to regex/selector scraper when no AI configured
      orgInfo = await pageScraper.scrapeOrgInfo(homepageUrl, helperConfig);
    }

    res.json({
      success: true,
      orgInfo
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test WordPress connection
router.post('/test-connection', async (req, res) => {
  try {
    const { wpUrl, username, appPassword } = req.body;

    if (!wpUrl || !username || !appPassword) {
      return res.status(400).json({ error: 'Missing credentials' });
    }

    const client = wordpressClient.create(wpUrl, username, appPassword);
    const result = await client.testConnection();

    res.json({
      success: true,
      user: result.user,
      roles: result.roles
    });
  } catch (error) {
    res.status(401).json({ success: false, error: error.message });
  }
});


// Scrape single URL and extract page data
router.post('/scrape-single', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const pageData = await pageScraper.scrape(url);
    const pageType = pageTypeDetector.detect(url, pageData);

    res.json({
      success: true,
      pageData,
      pageType
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate schema for a URL
router.post('/generate-schema', async (req, res) => {
  try {
    const { url, orgName, orgUrl, orgLogo, ogImage, areaServed, businessType, phone, address, sameAs, autoDetect, siteUrl, secretToken } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Helper config for fetching via WP plugin (bypasses CDN/WAF)
    const helperConfig = siteUrl && secretToken ? { siteUrl, secretToken } : null;

    const pageData = await pageScraper.scrape(url, { helperConfig });
    const pageType = pageTypeDetector.detect(url, pageData);

    // Override featured image if custom OG image provided
    if (ogImage) {
      pageData.featuredImage = ogImage;
    }

    // Auto-detect org info from homepage if not provided (cached per hostname)
    let detectedOrg = null;
    const needsAutoDetect = autoDetect || (!orgName && !areaServed);

    if (needsAutoDetect) {
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.host;
        const cached = orgInfoCache.get(hostname);

        if (cached && (Date.now() - cached.timestamp) < ORG_CACHE_TTL) {
          detectedOrg = cached.data;
        } else {
          const homepageUrl = `${urlObj.protocol}//${hostname}`;
          detectedOrg = await pageScraper.scrapeOrgInfo(homepageUrl);
          orgInfoCache.set(hostname, { data: detectedOrg, timestamp: Date.now() });
        }
      } catch (e) {
        console.log('Auto-detect failed:', e.message);
      }
    }

    const orgInfo = {
      name: orgName || detectedOrg?.name || process.env.DEFAULT_ORG_NAME || 'Organization',
      url: orgUrl || detectedOrg?.url || process.env.DEFAULT_ORG_URL || url,
      logo: orgLogo || detectedOrg?.logo || process.env.DEFAULT_ORG_LOGO || ''
    };

    // Build service areas from multiple sources
    let finalAreaServed = areaServed || '';
    if (!finalAreaServed && detectedOrg?.serviceAreas?.length > 0) {
      finalAreaServed = detectedOrg.serviceAreas.join(', ');
    }
    if (!finalAreaServed && process.env.DEFAULT_AREA_SERVED) {
      finalAreaServed = process.env.DEFAULT_AREA_SERVED;
    }

    // Build address from multiple sources
    let finalAddress = address;
    if (!finalAddress && detectedOrg?.address) {
      finalAddress = detectedOrg.address;
    }

    const options = {
      areaServed: finalAreaServed,
      businessType: businessType || detectedOrg?.businessType || process.env.DEFAULT_BUSINESS_TYPE || 'HVACBusiness',
      phone: phone || detectedOrg?.phone || pageData.phone || process.env.DEFAULT_PHONE || '',
      address: finalAddress,
      sameAs: sameAs && sameAs.length > 0 ? sameAs : undefined
    };

    const schema = schemaGenerator.generate(pageType, pageData, orgInfo, options);
    const schemaTypes = schemaGenerator.getSchemaTypes(schema);
    const validation = schemaGenerator.validate(schema);

    // Log the schema generation
    logger.log('schema_generated', {
      url,
      pageType,
      schemaTypes,
      title: pageData.title
    });

    res.json({
      success: true,
      url,
      pageType,
      pageData: {
        title: pageData.title,
        description: pageData.description,
        featuredImage: pageData.featuredImage,
        faqCount: pageData.faqs?.length || 0,
        phone: pageData.phone,
        serviceAreas: pageData.serviceAreas
      },
      schema,
      schemaTypes,
      validation
    });
  } catch (error) {
    logger.log('schema_generate_error', { url: req.body.url, error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Insert schema via WordPress REST API
router.post('/insert-schema', async (req, res) => {
  try {
    const { wpUrl, username, appPassword, postUrl, schema, pageType } = req.body;

    if (!wpUrl || !username || !appPassword || !postUrl || !schema) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const client = wordpressClient.create(wpUrl, username, appPassword);
    const result = await client.insertSchema(postUrl, schema, pageType);

    res.json({
      success: true,
      result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify schema is present on a page
router.post('/verify-insertion', async (req, res) => {
  try {
    const { url, expectedSchemaTypes } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Scrape the page to get existing schemas
    const pageData = await pageScraper.scrape(url);
    const existingSchemas = pageData.existingSchema || [];

    // Check what schema types are present
    const foundTypes = new Set();
    let hasGraph = false;

    for (const schema of existingSchemas) {
      if (schema['@graph']) {
        hasGraph = true;
        for (const item of schema['@graph']) {
          if (item['@type']) {
            foundTypes.add(item['@type']);
          }
        }
      } else if (schema['@type']) {
        foundTypes.add(schema['@type']);
      }
    }

    // Check if expected types are present
    const expectedTypes = expectedSchemaTypes || [];
    const missingTypes = expectedTypes.filter(t => !foundTypes.has(t));
    const verified = missingTypes.length === 0 && foundTypes.size > 0;

    res.json({
      success: true,
      verified,
      hasSchema: existingSchemas.length > 0,
      hasGraph,
      foundTypes: Array.from(foundTypes),
      missingTypes,
      schemaCount: existingSchemas.length,
      details: {
        url,
        checkedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk verify multiple pages
router.post('/verify-insertions-bulk', async (req, res) => {
  try {
    const { pages } = req.body;  // Array of { url, expectedSchemaTypes }

    if (!pages || !Array.isArray(pages)) {
      return res.status(400).json({ error: 'Pages array is required' });
    }

    const results = [];

    for (const page of pages) {
      try {
        const pageData = await pageScraper.scrape(page.url);
        const existingSchemas = pageData.existingSchema || [];

        const foundTypes = new Set();
        let hasGraph = false;

        for (const schema of existingSchemas) {
          if (schema['@graph']) {
            hasGraph = true;
            for (const item of schema['@graph']) {
              if (item['@type']) {
                foundTypes.add(item['@type']);
              }
            }
          } else if (schema['@type']) {
            foundTypes.add(schema['@type']);
          }
        }

        const expectedTypes = page.expectedSchemaTypes || [];
        const missingTypes = expectedTypes.filter(t => !foundTypes.has(t));
        const verified = missingTypes.length === 0 && foundTypes.size > 0;

        results.push({
          url: page.url,
          verified,
          hasSchema: existingSchemas.length > 0,
          foundTypes: Array.from(foundTypes),
          missingTypes,
          error: null
        });
      } catch (error) {
        results.push({
          url: page.url,
          verified: false,
          hasSchema: false,
          foundTypes: [],
          missingTypes: page.expectedSchemaTypes || [],
          error: error.message
        });
      }
    }

    const verifiedCount = results.filter(r => r.verified).length;
    const failedCount = results.filter(r => !r.verified).length;

    res.json({
      success: true,
      total: results.length,
      verified: verifiedCount,
      failed: failedCount,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// BULK INSERTION ROUTES
// =============================================================================

// Bulk insert schemas via RankMath REST API
router.post('/rankmath/bulk-insert', async (req, res) => {
  try {
    const { siteUrl, secretToken, urls, orgInfo, options = {} } = req.body;

    if (!siteUrl || !secretToken || !urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'siteUrl, secretToken, and urls array are required' });
    }

    const jobId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    jobs.set(jobId, { status: 'running', total: urls.length, processed: 0, results: [], errors: [] });

    processRankMathBulk(jobId, { siteUrl, secretToken, urls, orgInfo: orgInfo || {}, options });

    res.json({ success: true, jobId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk insert schemas via direct database
router.post('/db/bulk-insert', async (req, res) => {
  try {
    const { dbConfig, urls, orgInfo, options = {} } = req.body;

    if (!dbConfig || !urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'dbConfig and urls array are required' });
    }

    const jobId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    jobs.set(jobId, { status: 'running', total: urls.length, processed: 0, results: [], errors: [] });

    processDbBulk(jobId, { dbConfig, urls, orgInfo: orgInfo || {}, options });

    res.json({ success: true, jobId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Background bulk processing via RankMath
async function processRankMathBulk(jobId, options) {
  const job = jobs.get(jobId);

  try {
    const client = rankMathClient.create({ siteUrl: options.siteUrl, secretToken: options.secretToken });
    const helperConfig = { siteUrl: options.siteUrl, secretToken: options.secretToken };

    for (const url of options.urls) {
      try {
        const pageData = await pageScraper.scrape(url, { helperConfig });
        const pageType = pageTypeDetector.detect(url, pageData);
        const schema = schemaGenerator.generate(pageType, pageData, options.orgInfo, {
          areaServed: options.orgInfo.areaServed || '',
          businessType: options.orgInfo.businessType || 'HVACBusiness',
          phone: options.orgInfo.phone || '',
          sameAs: options.orgInfo.sameAs
        });

        // Insert
        const result = await client.insertByUrl(url, schema, { isPrimary: true });

        job.results.push({ url, pageType, success: result.success });
      } catch (urlError) {
        job.errors.push({ url, error: urlError.message });
      }

      job.processed++;
    }

    job.status = 'completed';
  } catch (error) {
    job.status = 'error';
    job.error = error.message;
  }
}

// Background bulk processing via direct database
async function processDbBulk(jobId, options) {
  const job = jobs.get(jobId);

  try {
    const client = getDbClient(options.dbConfig);

    for (const url of options.urls) {
      try {
        const pageData = await pageScraper.scrape(url);
        const pageType = pageTypeDetector.detect(url, pageData);
        const schema = schemaGenerator.generate(pageType, pageData, options.orgInfo, {
          areaServed: options.orgInfo.areaServed || '',
          businessType: options.orgInfo.businessType || 'HVACBusiness',
          phone: options.orgInfo.phone || '',
          sameAs: options.orgInfo.sameAs
        });

        // Find post by slug
        const urlObj = new URL(url);
        const pathStr = urlObj.pathname.replace(/\/$/, '');
        const slug = pathStr.split('/').pop();

        if (!slug) {
          job.errors.push({ url, error: 'Could not extract slug' });
          job.processed++;
          continue;
        }

        const post = await client.getPostIdBySlug(slug);
        if (!post) {
          job.errors.push({ url, error: `Post not found for slug: ${slug}` });
          job.processed++;
          continue;
        }

        // Insert schema
        const result = await client.insertFromGraph(post.ID, schema, {
          dryRun: false,
          backup: true
        });

        job.results.push({ url, pageType, postId: post.ID, success: result.success });
      } catch (urlError) {
        job.errors.push({ url, error: urlError.message });
      }

      job.processed++;
    }

    job.status = 'completed';
  } catch (error) {
    job.status = 'error';
    job.error = error.message;
  }
}

// =============================================================================
// DIRECT DATABASE ROUTES (for RankMath schema injection)
// =============================================================================

// Store active database connection pools (keyed by host:port:database)
const dbPools = new Map();

/**
 * Get or create a pooled database client from config
 */
function getDbClient(config) {
  const key = `${config.host}:${config.port || 3306}:${config.database}`;
  if (!dbPools.has(key)) {
    const client = databaseClient.createPool(config);
    dbPools.set(key, client);
  }
  return dbPools.get(key);
}

// Test direct database connection
router.post('/db/test-connection', async (req, res) => {
  try {
    const { host, user, password, database, port, tablePrefix } = req.body;

    if (!host || !user || !password || !database) {
      return res.status(400).json({ error: 'Missing required database credentials' });
    }

    const client = await databaseClient.create({
      host,
      user,
      password,
      database,
      port: port || 3306,
      tablePrefix: tablePrefix || 'wp_'
    });

    const result = await client.testConnection();
    await client.close();

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get post info by slug (READ-ONLY)
router.post('/db/get-post', async (req, res) => {
  try {
    const { host, user, password, database, port, tablePrefix, slug } = req.body;

    if (!slug) {
      return res.status(400).json({ error: 'Slug is required' });
    }

    const client = getDbClient({ host, user, password, database, port: port || 3306, tablePrefix: tablePrefix || 'wp_' });
    const post = await client.getPostIdBySlug(slug);

    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    res.json({ success: true, post });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get existing RankMath schemas for a post (READ-ONLY)
router.post('/db/get-schemas', async (req, res) => {
  try {
    const { host, user, password, database, port, tablePrefix, postId } = req.body;

    if (!postId) {
      return res.status(400).json({ error: 'Post ID is required' });
    }

    const client = getDbClient({ host, user, password, database, port: port || 3306, tablePrefix: tablePrefix || 'wp_' });
    const schemas = await client.getExistingSchemas(postId);

    res.json({ success: true, postId, schemas, count: schemas.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Preview schema insertion (DRY-RUN - NO CHANGES MADE)
router.post('/db/preview-insertion', async (req, res) => {
  try {
    const { host, user, password, database, port, tablePrefix, postId, schema, schemaType } = req.body;

    if (!postId || !schema) {
      return res.status(400).json({ error: 'Post ID and schema are required' });
    }

    const client = getDbClient({ host, user, password, database, port: port || 3306, tablePrefix: tablePrefix || 'wp_' });
    const preview = await client.previewInsertion(postId, schema, schemaType || 'Custom');

    res.json({ success: true, ...preview });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Insert schema into database
// IMPORTANT: Set dryRun: false to actually make changes
// Schemas are converted to RankMath's internal PHP serialized format
router.post('/db/insert-schema', async (req, res) => {
  try {
    const {
      host, user, password, database, port, tablePrefix,
      postId, schema, schemaType, dryRun = true, backup = true, isPrimary = true
    } = req.body;

    if (!postId || !schema) {
      return res.status(400).json({ error: 'Post ID and schema are required' });
    }

    const client = getDbClient({ host, user, password, database, port: port || 3306, tablePrefix: tablePrefix || 'wp_' });
    const result = await client.insertSchema(postId, schema, schemaType, { dryRun, backup, isPrimary });

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Insert multiple schemas at once (e.g., Service + FAQPage)
// First schema in array is treated as primary
router.post('/db/insert-multiple-schemas', async (req, res) => {
  try {
    const {
      host, user, password, database, port, tablePrefix,
      postId, schemas, dryRun = true, backup = true
    } = req.body;

    if (!postId || !schemas || !Array.isArray(schemas)) {
      return res.status(400).json({ error: 'Post ID and schemas array are required' });
    }

    const client = getDbClient({ host, user, password, database, port: port || 3306, tablePrefix: tablePrefix || 'wp_' });
    const result = await client.insertMultipleSchemas(postId, schemas, { dryRun, backup });

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Insert schemas from a JSON-LD @graph structure
// Automatically splits into individual RankMath schemas
router.post('/db/insert-from-graph', async (req, res) => {
  try {
    const {
      host, user, password, database, port, tablePrefix,
      postId, graphSchema, primaryType, dryRun = true, backup = true
    } = req.body;

    if (!postId || !graphSchema) {
      return res.status(400).json({ error: 'Post ID and graphSchema are required' });
    }

    const client = getDbClient({ host, user, password, database, port: port || 3306, tablePrefix: tablePrefix || 'wp_' });
    const result = await client.insertFromGraph(postId, graphSchema, { dryRun, backup, primaryType });

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete all schemas from a post
router.post('/db/delete-all-schemas', async (req, res) => {
  try {
    const {
      host, user, password, database, port, tablePrefix,
      postId, dryRun = true, backup = true
    } = req.body;

    if (!postId) {
      return res.status(400).json({ error: 'Post ID is required' });
    }

    const client = getDbClient({ host, user, password, database, port: port || 3306, tablePrefix: tablePrefix || 'wp_' });
    const result = await client.deleteAllSchemas(postId, { dryRun, backup });

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get list of supported schema types
router.get('/db/schema-types', (req, res) => {
  res.json({
    success: true,
    schemaTypes: databaseClient.SCHEMA_TYPES
  });
});

// Set rich snippet type
router.post('/db/set-rich-snippet', async (req, res) => {
  try {
    const {
      host, user, password, database, port, tablePrefix,
      postId, snippetType, dryRun = true
    } = req.body;

    if (!postId || !snippetType) {
      return res.status(400).json({ error: 'Post ID and snippet type are required' });
    }

    const client = getDbClient({ host, user, password, database, port: port || 3306, tablePrefix: tablePrefix || 'wp_' });
    const result = await client.setRichSnippetType(postId, snippetType, { dryRun });

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rollback to previous state
router.post('/db/rollback', async (req, res) => {
  try {
    const { host, user, password, database, port, tablePrefix, postId } = req.body;

    if (!postId) {
      return res.status(400).json({ error: 'Post ID is required' });
    }

    const client = getDbClient({ host, user, password, database, port: port || 3306, tablePrefix: tablePrefix || 'wp_' });
    const result = await client.rollback(postId);

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// List all persisted backups
router.post('/db/backups', async (req, res) => {
  try {
    const { host, user, password, database, port, tablePrefix } = req.body;
    const client = getDbClient({ host, user, password, database, port: port || 3306, tablePrefix: tablePrefix || 'wp_' });
    const backups = client.listBackups();
    res.json({ success: true, backups });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Restore from file-persisted backup
router.post('/db/restore-backup', async (req, res) => {
  try {
    const { host, user, password, database, port, tablePrefix, postId } = req.body;

    if (!postId) {
      return res.status(400).json({ error: 'Post ID is required' });
    }

    const client = getDbClient({ host, user, password, database, port: port || 3306, tablePrefix: tablePrefix || 'wp_' });
    const result = await client.rollback(postId);

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete specific meta entry (USE WITH CAUTION)
router.post('/db/delete-meta', async (req, res) => {
  try {
    const {
      host, user, password, database, port, tablePrefix,
      metaId, dryRun = true
    } = req.body;

    if (!metaId) {
      return res.status(400).json({ error: 'Meta ID is required' });
    }

    const client = getDbClient({ host, user, password, database, port: port || 3306, tablePrefix: tablePrefix || 'wp_' });
    const result = await client.deleteMeta(metaId, { dryRun });

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Full workflow: find post by URL, preview/insert schema
router.post('/db/insert-by-url', async (req, res) => {
  try {
    const {
      host, user, password, database, port, tablePrefix,
      pageUrl, schema, schemaType, dryRun = true, backup = true
    } = req.body;

    if (!pageUrl || !schema) {
      return res.status(400).json({ error: 'Page URL and schema are required' });
    }

    // Extract slug from URL
    const urlObj = new URL(pageUrl);
    const path = urlObj.pathname.replace(/\/$/, '');
    const slug = path.split('/').pop();

    if (!slug) {
      return res.status(400).json({ error: 'Could not extract slug from URL' });
    }

    const client = getDbClient({ host, user, password, database, port: port || 3306, tablePrefix: tablePrefix || 'wp_' });

    // Find post by slug
    const post = await client.getPostIdBySlug(slug);
    if (!post) {
      return res.status(404).json({ success: false, error: `Post not found for slug: ${slug}` });
    }

    // Insert schema
    const result = await client.insertSchema(post.ID, schema, schemaType || 'Custom', { dryRun, backup });

    res.json({
      success: true,
      post: { id: post.ID, title: post.post_title, type: post.post_type, slug },
      ...result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// SCHEMA DIFF
// ============================================================================

// Compare new schemas against existing schemas on the site
router.post('/rankmath/diff', async (req, res) => {
  try {
    const { siteUrl, secretToken, pageUrl, newSchemas } = req.body;

    if (!siteUrl || !secretToken || !pageUrl || !newSchemas) {
      return res.status(400).json({ error: 'siteUrl, secretToken, pageUrl, and newSchemas are required' });
    }

    // Fetch existing schemas from site
    const client = rankMathClient.create({ siteUrl, secretToken });
    const pageInfo = await client.getPageInfo(pageUrl);

    let oldSchemas = [];
    if (pageInfo.success && pageInfo.existingSchemas) {
      oldSchemas = pageInfo.existingSchemas.map(s => {
        if (s.schema) return s.schema;
        if (s.meta_value) return schemaDiff.tryParsePhpSerialized(s.meta_value);
        return s;
      }).filter(Boolean);
    }

    // Normalize newSchemas - extract from @graph if needed
    let newSchemaList = [];
    if (Array.isArray(newSchemas)) {
      newSchemaList = newSchemas;
    } else if (newSchemas['@graph']) {
      newSchemaList = newSchemas['@graph'];
    } else {
      newSchemaList = [newSchemas];
    }

    const result = schemaDiff.compareSchemas(oldSchemas, newSchemaList);

    res.json({
      success: true,
      pageUrl,
      ...result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// RankMath REST API Routes (via Helper Plugin)
// These routes work with any WordPress site that has the helper snippet installed
// ============================================================================

// Test connection to RankMath helper
router.post('/rankmath/test-connection', async (req, res) => {
  try {
    const { siteUrl, secretToken } = req.body;

    if (!siteUrl || !secretToken) {
      return res.status(400).json({ error: 'siteUrl and secretToken are required' });
    }

    const client = rankMathClient.create({ siteUrl, secretToken });
    const result = await client.testConnection();

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Find post by slug or URL
router.post('/rankmath/find-post', async (req, res) => {
  try {
    const { siteUrl, secretToken, slug, url } = req.body;

    if (!siteUrl || !secretToken) {
      return res.status(400).json({ error: 'siteUrl and secretToken are required' });
    }

    if (!slug && !url) {
      return res.status(400).json({ error: 'slug or url is required' });
    }

    const client = rankMathClient.create({ siteUrl, secretToken });
    const result = await client.findPost(url || slug);

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get existing schemas for a post
router.post('/rankmath/get-schemas', async (req, res) => {
  try {
    const { siteUrl, secretToken, postId } = req.body;

    if (!siteUrl || !secretToken || !postId) {
      return res.status(400).json({ error: 'siteUrl, secretToken, and postId are required' });
    }

    const client = rankMathClient.create({ siteUrl, secretToken });
    const result = await client.getSchemas(postId);

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get page info including existing schemas
router.post('/rankmath/page-info', async (req, res) => {
  try {
    const { siteUrl, secretToken, pageUrl } = req.body;

    if (!siteUrl || !secretToken || !pageUrl) {
      return res.status(400).json({ error: 'siteUrl, secretToken, and pageUrl are required' });
    }

    const client = rankMathClient.create({ siteUrl, secretToken });
    const result = await client.getPageInfo(pageUrl);

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Insert single schema
router.post('/rankmath/insert-schema', async (req, res) => {
  try {
    const { siteUrl, secretToken, postId, schema, schemaType, isPrimary = true } = req.body;

    if (!siteUrl || !secretToken || !postId || !schema) {
      return res.status(400).json({ error: 'siteUrl, secretToken, postId, and schema are required' });
    }

    const client = rankMathClient.create({ siteUrl, secretToken });
    const result = await client.insertSchema(postId, schema, { schemaType, isPrimary });

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Insert multiple schemas
router.post('/rankmath/insert-multiple', async (req, res) => {
  try {
    const { siteUrl, secretToken, postId, schemas } = req.body;

    if (!siteUrl || !secretToken || !postId || !schemas) {
      return res.status(400).json({ error: 'siteUrl, secretToken, postId, and schemas are required' });
    }

    const client = rankMathClient.create({ siteUrl, secretToken });
    const result = await client.insertMultipleSchemas(postId, schemas);

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Insert schema by URL (finds post automatically)
router.post('/rankmath/insert-by-url', async (req, res) => {
  try {
    const { siteUrl, secretToken, pageUrl, schema, schemaType, isPrimary = true, replaceExisting = true } = req.body;

    if (!siteUrl || !secretToken || !pageUrl || !schema) {
      return res.status(400).json({ error: 'siteUrl, secretToken, pageUrl, and schema are required' });
    }

    const client = rankMathClient.create({ siteUrl, secretToken });

    // Delete existing schemas first to prevent duplicates
    if (replaceExisting) {
      try {
        const postInfo = await client.findPost(pageUrl);
        if (postInfo.success) {
          await client.deleteSchemas(postInfo.post_id);
        }
      } catch (deleteError) {
        console.log('Note: Could not delete existing schemas:', deleteError.message);
      }
    }

    const result = await client.insertByUrl(pageUrl, schema, { schemaType, isPrimary });

    // Log successful insertion
    logger.log('schema_inserted', {
      siteUrl,
      pageUrl,
      schemaType: schemaType || 'auto',
      success: result.success,
      results: result.results
    });

    res.json(result);
  } catch (error) {
    logger.log('schema_insert_error', { pageUrl: req.body.pageUrl, error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Insert multiple schemas by URL
router.post('/rankmath/insert-multiple-by-url', async (req, res) => {
  try {
    const { siteUrl, secretToken, pageUrl, schemas, replaceExisting = true } = req.body;

    if (!siteUrl || !secretToken || !pageUrl || !schemas) {
      return res.status(400).json({ error: 'siteUrl, secretToken, pageUrl, and schemas are required' });
    }

    const client = rankMathClient.create({ siteUrl, secretToken });

    // Delete existing schemas first to prevent duplicates
    if (replaceExisting) {
      try {
        const postInfo = await client.findPost(pageUrl);
        if (postInfo.success) {
          await client.deleteSchemas(postInfo.post_id);
        }
      } catch (deleteError) {
        console.log('Note: Could not delete existing schemas:', deleteError.message);
      }
    }

    const result = await client.insertMultipleByUrl(pageUrl, schemas);

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete schemas
router.post('/rankmath/delete-schemas', async (req, res) => {
  try {
    const { siteUrl, secretToken, postId, schemaType } = req.body;

    if (!siteUrl || !secretToken || !postId) {
      return res.status(400).json({ error: 'siteUrl, secretToken, and postId are required' });
    }

    const client = rankMathClient.create({ siteUrl, secretToken });
    const result = await client.deleteSchemas(postId, schemaType);

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Full workflow: Generate schema and insert into RankMath
router.post('/rankmath/generate-and-insert', async (req, res) => {
  try {
    const {
      siteUrl,
      secretToken,
      pageUrl,
      orgInfo,
      options = {}
    } = req.body;

    if (!siteUrl || !secretToken || !pageUrl) {
      return res.status(400).json({ error: 'siteUrl, secretToken, and pageUrl are required' });
    }

    // Step 1: Scrape the page (via helper to bypass CDN/WAF)
    const helperConfig = { siteUrl, secretToken };
    const pageData = await pageScraper.scrape(pageUrl, { helperConfig });

    // Step 2: Detect page type
    const pageType = pageTypeDetector.detect(pageUrl, pageData);

    // Step 3: Generate schema
    const schema = await schemaGenerator.generate(pageUrl, pageData, pageType, orgInfo || {});

    // Step 4: Find the post
    const client = rankMathClient.create({ siteUrl, secretToken });
    const postInfo = await client.findPost(pageUrl);

    if (!postInfo.success) {
      return res.status(404).json({ success: false, error: 'Post not found', pageUrl });
    }

    // Step 4b: Delete existing schemas to avoid duplicates
    // This prevents the "Missing field address" error from old schemas
    try {
      await client.deleteSchemas(postInfo.post_id);
    } catch (deleteError) {
      // Log but continue - might not have any existing schemas
      console.log('Note: Could not delete existing schemas:', deleteError.message);
    }

    // Step 5: Prepare schemas for insertion
    // Split @graph into individual schemas
    const schemas = [];
    if (schema['@graph']) {
      for (const item of schema['@graph']) {
        const type = item['@type'];
        const schemaType = Array.isArray(type) ? type[0] : type;

        // Skip certain types that RankMath handles globally
        if (['WebSite', 'Organization', 'Place', 'ImageObject'].includes(schemaType)) {
          if (Object.keys(item).length <= 3) continue;
        }

        schemas.push({ schema: item, type: schemaType });
      }
    } else {
      const type = schema['@type'];
      const schemaType = Array.isArray(type) ? type[0] : type;
      schemas.push({ schema, type: schemaType });
    }

    // Step 6: Insert schemas
    let insertResult;
    if (schemas.length > 1) {
      insertResult = await client.insertMultipleSchemas(postInfo.post_id, schemas);
    } else if (schemas.length === 1) {
      insertResult = await client.insertSchema(postInfo.post_id, schemas[0].schema, {
        schemaType: schemas[0].type,
        isPrimary: true
      });
    } else {
      return res.status(400).json({ success: false, error: 'No schemas generated' });
    }

    res.json({
      success: true,
      pageUrl,
      postId: postInfo.post_id,
      postTitle: postInfo.post_title,
      pageType,
      schemasInserted: schemas.length,
      schemaTypes: schemas.map(s => s.type),
      insertResult,
      generatedSchema: schema
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get supported schema types
router.get('/rankmath/schema-types', (req, res) => {
  res.json({
    success: true,
    schemaTypes: rankMathClient.SCHEMA_TYPES
  });
});

// ============ LOGGING ENDPOINTS ============

// Get activity logs
router.get('/logs', (req, res) => {
  const { limit = 100, filter } = req.query;
  const logs = logger.getLogs(parseInt(limit), filter);
  res.json({ success: true, logs });
});

// Get token usage
router.get('/logs/tokens', (req, res) => {
  const usage = logger.getTokenUsage();
  res.json({ success: true, usage });
});

// Get stats summary
router.get('/logs/stats', (req, res) => {
  const stats = logger.getStats();
  res.json({ success: true, stats });
});

// Clear logs
router.delete('/logs', (req, res) => {
  logger.clearLogs();
  res.json({ success: true, message: 'Logs cleared' });
});

module.exports = router;
