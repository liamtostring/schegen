const { test, describe } = require('node:test');
const assert = require('node:assert');

const schemaGenerator = require('../src/services/schemaGenerator');
const pageTypeDetector = require('../src/services/pageTypeDetector');
const articleSchema = require('../src/schemas/article');
const serviceSchema = require('../src/schemas/service');
const faqSchema = require('../src/schemas/faq');
const localBusinessSchema = require('../src/schemas/localBusiness');
const breadcrumbSchema = require('../src/schemas/breadcrumb');

describe('Page Type Detector', () => {
  test('detects blog posts by URL pattern', () => {
    const pageData = { wordpressInfo: { postType: 'unknown' } };

    assert.strictEqual(
      pageTypeDetector.detect('https://example.com/blog/my-post', pageData),
      'article'
    );

    assert.strictEqual(
      pageTypeDetector.detect('https://example.com/news/update', pageData),
      'article'
    );

    assert.strictEqual(
      pageTypeDetector.detect('https://example.com/2024/01/post', pageData),
      'article'
    );
  });

  test('detects service pages by URL pattern', () => {
    const pageData = { wordpressInfo: { postType: 'unknown' } };

    assert.strictEqual(
      pageTypeDetector.detect('https://example.com/services/web-design', pageData),
      'service'
    );

    assert.strictEqual(
      pageTypeDetector.detect('https://example.com/our-services/', pageData),
      'service'
    );
  });

  test('detects HVAC service pages by URL pattern', () => {
    const pageData = { wordpressInfo: { postType: 'unknown' } };

    assert.strictEqual(
      pageTypeDetector.detect('https://example.com/ac-repair', pageData),
      'service'
    );

    assert.strictEqual(
      pageTypeDetector.detect('https://example.com/hvac-services', pageData),
      'service'
    );

    assert.strictEqual(
      pageTypeDetector.detect('https://example.com/heating-installation', pageData),
      'service'
    );
  });

  test('detects articles by author and date', () => {
    const pageData = {
      author: 'John Doe',
      publishDate: '2024-01-15T10:00:00Z',
      wordpressInfo: { postType: 'post' }
    };

    assert.strictEqual(
      pageTypeDetector.detect('https://example.com/page', pageData),
      'article'
    );
  });

  test('detects service pages without date and with keywords', () => {
    const pageData = {
      title: 'Our Web Design Services',
      content: 'Get a free consultation for our service offerings',
      headings: [{ level: 'h1', text: 'What We Offer' }],
      wordpressInfo: { postType: 'page' }
    };

    assert.strictEqual(
      pageTypeDetector.detect('https://example.com/web-design', pageData),
      'service'
    );
  });
});

describe('Article Schema Generator', () => {
  const mockPageData = {
    url: 'https://example.com/blog/test-post',
    title: 'Test Blog Post Title',
    description: 'This is a test blog post description.',
    author: 'Jane Author',
    publishDate: '2024-01-15T10:00:00Z',
    modifiedDate: '2024-01-16T12:00:00Z',
    featuredImage: 'https://example.com/image.jpg',
    categories: ['Technology'],
    tags: ['JavaScript', 'Node.js']
  };

  const mockOrgInfo = {
    name: 'Test Company',
    url: 'https://example.com',
    logo: 'https://example.com/logo.png'
  };

  test('generates valid Article schema', () => {
    const schema = articleSchema.generate(mockPageData, mockOrgInfo);

    // Article schema is now part of @graph, so no @context
    assert.strictEqual(schema['@type'], 'Article');
    assert.strictEqual(schema.headline, mockPageData.title);
    assert.strictEqual(schema.description, mockPageData.description);
    assert.ok(schema['@id']); // Should have @id
  });

  test('includes author information', () => {
    const schema = articleSchema.generate(mockPageData, mockOrgInfo);

    assert.strictEqual(schema.author['@type'], 'Person');
    assert.strictEqual(schema.author.name, 'Jane Author');
  });

  test('includes publisher information', () => {
    const schema = articleSchema.generate(mockPageData, mockOrgInfo);

    assert.strictEqual(schema.publisher['@type'], 'Organization');
    assert.strictEqual(schema.publisher.name, 'Test Company');
    assert.strictEqual(schema.publisher.logo.url, mockOrgInfo.logo);
  });

  test('includes dates', () => {
    const schema = articleSchema.generate(mockPageData, mockOrgInfo);

    assert.strictEqual(schema.datePublished, mockPageData.publishDate);
    assert.strictEqual(schema.dateModified, mockPageData.modifiedDate);
  });

  test('includes keywords from tags', () => {
    const schema = articleSchema.generate(mockPageData, mockOrgInfo);

    assert.strictEqual(schema.keywords, 'JavaScript, Node.js');
  });

  test('falls back to org as author when no author', () => {
    const pageDataNoAuthor = { ...mockPageData, author: '' };
    const schema = articleSchema.generate(pageDataNoAuthor, mockOrgInfo);

    assert.strictEqual(schema.author['@type'], 'Organization');
    assert.strictEqual(schema.author.name, 'Test Company');
  });
});

describe('Service Schema Generator', () => {
  const mockPageData = {
    url: 'https://example.com/services/ac-repair',
    title: 'AC Repair Services',
    description: 'Professional AC repair services for your home.',
    featuredImage: 'https://example.com/service.jpg',
    content: 'We offer comprehensive air conditioning repair solutions.'
  };

  const mockOrgInfo = {
    name: 'Cool HVAC Company',
    url: 'https://example.com',
    logo: 'https://example.com/logo.png'
  };

  test('generates valid Service schema', () => {
    const schema = serviceSchema.generate(mockPageData, mockOrgInfo);

    // Service schema is now part of @graph, so no @context
    assert.strictEqual(schema['@type'], 'Service');
    assert.ok(schema.name);
    assert.strictEqual(schema.url, mockPageData.url);
    assert.ok(schema['@id']); // Should have @id
  });

  test('includes provider information as HVACBusiness', () => {
    const schema = serviceSchema.generate(mockPageData, mockOrgInfo);

    // Provider defaults to HVACBusiness for HVAC services
    assert.strictEqual(schema.provider['@type'], 'HVACBusiness');
    assert.strictEqual(schema.provider.name, 'Cool HVAC Company');
    assert.strictEqual(schema.provider.url, mockOrgInfo.url);
  });

  test('detects HVAC service type from content', () => {
    const schema = serviceSchema.generate(mockPageData, mockOrgInfo);

    // Should detect AC Repair service type
    assert.ok(schema.serviceType.toLowerCase().includes('air conditioning') ||
              schema.serviceType.toLowerCase().includes('ac'));
  });

  test('includes area served when provided', () => {
    const schema = serviceSchema.generate(mockPageData, mockOrgInfo, {
      areaServed: 'Houston'
    });

    // Single area is now City type (more specific than Place)
    assert.strictEqual(schema.areaServed['@type'], 'City');
    assert.strictEqual(schema.areaServed.name, 'Houston');
  });

  test('supports multiple areas served', () => {
    const schema = serviceSchema.generate(mockPageData, mockOrgInfo, {
      areaServed: 'Houston, Dallas, Austin'
    });

    assert.ok(Array.isArray(schema.areaServed));
    assert.strictEqual(schema.areaServed.length, 3);
    assert.strictEqual(schema.areaServed[0].name, 'Houston');
  });
});

describe('FAQ Schema Generator', () => {
  test('generates valid FAQPage schema', () => {
    const faqs = [
      { question: 'What is HVAC?', answer: 'HVAC stands for Heating, Ventilation, and Air Conditioning.' },
      { question: 'How often should I service my AC?', answer: 'We recommend annual maintenance for optimal performance.' }
    ];

    const schema = faqSchema.generate(faqs);

    assert.strictEqual(schema['@type'], 'FAQPage');
    assert.ok(Array.isArray(schema.mainEntity));
    assert.strictEqual(schema.mainEntity.length, 2);
    assert.strictEqual(schema.mainEntity[0]['@type'], 'Question');
    assert.strictEqual(schema.mainEntity[0].acceptedAnswer['@type'], 'Answer');
  });

  test('returns null for empty FAQs', () => {
    const schema = faqSchema.generate([]);
    assert.strictEqual(schema, null);
  });

  test('filters out invalid FAQs', () => {
    const faqs = [
      { question: 'What is HVAC?', answer: 'HVAC means Heating, Ventilation, and Air Conditioning.' },
      { question: 'Another question?', answer: 'Another answer.' },
      { question: '', answer: 'Answer without question' }, // No question - filtered
      { question: 'Question without answer', answer: '' }, // No answer - filtered
      { question: '   ', answer: 'Whitespace question' } // Whitespace only - filtered
    ];

    const schema = faqSchema.generate(faqs);
    // Only first 2 FAQs should pass (have both question and answer with content)
    assert.strictEqual(schema.mainEntity.length, 2);
  });
});

describe('LocalBusiness Schema Generator', () => {
  const mockOrgInfo = {
    name: 'Cool HVAC Services',
    url: 'https://coolhvac.com',
    logo: 'https://coolhvac.com/logo.png'
  };

  test('generates HVACBusiness schema by default', () => {
    const schema = localBusinessSchema.generate(mockOrgInfo);

    assert.strictEqual(schema['@type'], 'HVACBusiness');
    assert.strictEqual(schema.name, mockOrgInfo.name);
    assert.strictEqual(schema.url, mockOrgInfo.url);
  });

  test('supports custom business types', () => {
    const schema = localBusinessSchema.generate(mockOrgInfo, { businessType: 'Plumber' });

    assert.strictEqual(schema['@type'], 'Plumber');
  });

  test('includes service areas', () => {
    const schema = localBusinessSchema.generate(mockOrgInfo, {
      serviceAreas: ['Houston', 'Dallas', 'Austin']
    });

    assert.ok(Array.isArray(schema.areaServed));
    assert.strictEqual(schema.areaServed.length, 3);
  });

  test('includes offer catalog with HVAC services', () => {
    const schema = localBusinessSchema.generate(mockOrgInfo);

    assert.ok(schema.hasOfferCatalog);
    assert.ok(Array.isArray(schema.hasOfferCatalog.itemListElement));
  });
});

describe('Breadcrumb Schema Generator', () => {
  test('generates BreadcrumbList from breadcrumb data', () => {
    const breadcrumbs = [
      { name: 'Home', url: 'https://example.com' },
      { name: 'Services', url: 'https://example.com/services' },
      { name: 'AC Repair', url: 'https://example.com/services/ac-repair' }
    ];

    const schema = breadcrumbSchema.generate(breadcrumbs);

    assert.strictEqual(schema['@type'], 'BreadcrumbList');
    assert.strictEqual(schema.itemListElement.length, 3);
    assert.strictEqual(schema.itemListElement[0].position, 1);
    assert.strictEqual(schema.itemListElement[2].position, 3);
  });

  test('generates breadcrumbs from URL', () => {
    const breadcrumbs = breadcrumbSchema.generateFromUrl(
      'https://example.com/services/ac-repair',
      'HVAC Company'
    );

    assert.ok(Array.isArray(breadcrumbs));
    assert.strictEqual(breadcrumbs[0].name, 'HVAC Company');
    assert.ok(breadcrumbs.length >= 2);
  });

  test('returns null for insufficient breadcrumbs', () => {
    const schema = breadcrumbSchema.generate([{ name: 'Home', url: '/' }]);
    assert.strictEqual(schema, null);
  });
});

describe('Schema Generator Main', () => {
  test('generates @graph structure for article type', () => {
    const pageData = {
      url: 'https://example.com/blog/post',
      title: 'Test Post',
      description: 'Description'
    };

    const orgInfo = { name: 'Company', url: 'https://example.com' };
    const schema = schemaGenerator.generate('article', pageData, orgInfo);

    assert.strictEqual(schema['@context'], 'https://schema.org');
    assert.ok(Array.isArray(schema['@graph']));

    // Should have Article and WebPage at minimum
    const types = schema['@graph'].map(s => s['@type']);
    assert.ok(types.includes('Article'));
    assert.ok(types.includes('WebPage'));
  });

  test('generates @graph structure for service type', () => {
    const pageData = {
      url: 'https://example.com/services/test',
      title: 'Test Service',
      description: 'Description'
    };

    const orgInfo = { name: 'Company', url: 'https://example.com' };
    const schema = schemaGenerator.generate('service', pageData, orgInfo);

    assert.strictEqual(schema['@context'], 'https://schema.org');
    assert.ok(Array.isArray(schema['@graph']));

    // Should have Service, LocalBusiness, BreadcrumbList, and WebPage
    const types = schema['@graph'].map(s => s['@type']);
    assert.ok(types.includes('Service'));
    assert.ok(types.includes('HVACBusiness'));
    assert.ok(types.includes('WebPage'));
  });

  test('includes FAQPage when FAQs are present', () => {
    const pageData = {
      url: 'https://example.com/services/ac-repair',
      title: 'AC Repair',
      description: 'AC Repair Services',
      faqs: [
        { question: 'How much does AC repair cost?', answer: 'AC repair typically costs between $100-$500 depending on the issue.' },
        { question: 'How long does repair take?', answer: 'Most repairs can be completed within 1-2 hours.' }
      ]
    };

    const orgInfo = { name: 'Company', url: 'https://example.com' };
    const schema = schemaGenerator.generate('service', pageData, orgInfo);

    const types = schema['@graph'].map(s => s['@type']);
    assert.ok(types.includes('FAQPage'));
  });

  test('getSchemaTypes returns list of types', () => {
    const pageData = {
      url: 'https://example.com/services/test',
      title: 'Test',
      description: 'Test'
    };

    const orgInfo = { name: 'Company', url: 'https://example.com' };
    const schema = schemaGenerator.generate('service', pageData, orgInfo);
    const types = schemaGenerator.getSchemaTypes(schema);

    assert.ok(Array.isArray(types));
    assert.ok(types.includes('Service'));
  });

  test('validates @graph schema structure', () => {
    const validSchema = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Service',
          'name': 'Test Service',
          'description': 'Description',
          'provider': { '@type': 'Organization', name: 'Company' }
        },
        {
          '@type': 'WebPage',
          'name': 'Test',
          'url': 'https://example.com'
        }
      ]
    };

    const result = schemaGenerator.validate(validSchema);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.schemaCount, 2);
  });

  test('validates Article schema', () => {
    const validSchema = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Test',
      author: { '@type': 'Person', name: 'Author' },
      datePublished: '2024-01-01',
      publisher: { '@type': 'Organization', name: 'Pub' },
      image: 'https://example.com/image.jpg'
    };

    const result = schemaGenerator.validate(validSchema);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  test('validates Service schema', () => {
    const validSchema = {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'Test Service',
      description: 'Description',
      provider: { '@type': 'Organization', name: 'Company' }
    };

    const result = schemaGenerator.validate(validSchema);
    assert.strictEqual(result.valid, true);
  });

  test('reports missing required fields', () => {
    const invalidSchema = {
      '@type': 'Article'
    };

    const result = schemaGenerator.validate(invalidSchema);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.includes('Missing @context'));
  });

  test('generates script tag format', () => {
    const schema = { '@context': 'https://schema.org', '@type': 'Article' };
    const scriptTag = schemaGenerator.toScriptTag(schema);

    assert.ok(scriptTag.includes('<script type="application/ld+json">'));
    assert.ok(scriptTag.includes('</script>'));
  });

  test('generates RankMath format', () => {
    const schema = { '@context': 'https://schema.org', '@type': 'Article' };
    const rankMath = schemaGenerator.toRankMathFormat(schema, 'article');

    assert.strictEqual(rankMath.key, 'rank_math_schema_Article');
    assert.ok(typeof rankMath.value === 'string');
  });
});
