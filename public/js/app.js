// Schema Generator Frontend JavaScript

document.addEventListener('DOMContentLoaded', () => {
  // ==================== Theme Toggle ====================
  initThemeToggle();

  // ==================== Back to Top Button ====================
  initBackToTop();

  // Tab switching
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });

      const tabId = tab.dataset.tab + '-tab';
      document.getElementById(tabId)?.classList.add('active');
    });
  });

  // Test connection button
  const testConnectionBtn = document.getElementById('test-connection');
  if (testConnectionBtn) {
    testConnectionBtn.addEventListener('click', testConnection);
  }

  // Auto-detect org info button
  const detectOrgBtn = document.getElementById('detect-org-info');
  if (detectOrgBtn) {
    detectOrgBtn.addEventListener('click', detectOrgInfo);
  }

  // Single URL form
  const singleForm = document.getElementById('single-form');
  if (singleForm) {
    singleForm.addEventListener('submit', handleSingleUrl);
  }

  // Paste URLs form
  const pasteForm = document.getElementById('paste-form');
  if (pasteForm) {
    pasteForm.addEventListener('submit', handlePasteUrls);
  }

  // Update URL count as user types
  const pasteTextarea = document.getElementById('pasteUrls');
  if (pasteTextarea) {
    pasteTextarea.addEventListener('input', updatePasteUrlCount);
  }


  // Schema selection controls - only affects visible (non-filtered) items
  document.getElementById('select-all-schemas')?.addEventListener('change', (e) => {
    document.querySelectorAll('.schema-item:not(.filter-hidden) .schema-select:not(:disabled)').forEach(cb => {
      cb.checked = e.target.checked;
      updateSchemaItemStyle(cb);
    });
  });

  document.getElementById('insert-selected')?.addEventListener('click', insertSelectedSchemas);
  document.getElementById('save-as-json')?.addEventListener('click', saveAsJson);
  document.getElementById('copy-all-schemas')?.addEventListener('click', copyAllSchemas);
  document.getElementById('download-all-schemas')?.addEventListener('click', downloadAllSchemas);

  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      filterSchemasByType(tab.dataset.filter);
    });
  });

  // Bulk publish by type
  document.getElementById('insert-all-services')?.addEventListener('click', () => insertAllByType('service'));
  document.getElementById('insert-all-locations')?.addEventListener('click', () => insertAllByType('location'));
  document.getElementById('insert-all-articles')?.addEventListener('click', () => insertAllByType('article'));

  // AI provider selection
  const aiProviderSelect = document.getElementById('aiProvider');
  if (aiProviderSelect) {
    aiProviderSelect.addEventListener('change', () => {
      updateAIModels();
      checkUIApiKey();
      // Save selected provider
      try {
        localStorage.setItem('aiProvider', aiProviderSelect.value);
      } catch (e) {}
    });
    loadAIProviders();
  }

  // API key input listeners - update status and save as user types
  const openaiKeyInput = document.getElementById('openaiApiKey');
  const geminiKeyInput = document.getElementById('geminiApiKey');
  if (openaiKeyInput) {
    openaiKeyInput.addEventListener('input', () => {
      saveApiKey('openai', openaiKeyInput.value);
      checkUIApiKey();
    });
  }
  if (geminiKeyInput) {
    geminiKeyInput.addEventListener('input', () => {
      saveApiKey('gemini', geminiKeyInput.value);
      checkUIApiKey();
    });
  }

  // Note: API keys are loaded after providers in loadAIProviders()

  // AI verification buttons
  document.getElementById('ai-verify-selected')?.addEventListener('click', () => verifyWithAI('selected'));
  document.getElementById('ai-verify-all')?.addEventListener('click', () => verifyWithAI('all'));

  // Modal close
  document.querySelector('.modal-close')?.addEventListener('click', () => {
    document.getElementById('schema-preview')?.classList.add('hidden');
  });

  // Close modal on outside click
  document.getElementById('schema-preview')?.addEventListener('click', (e) => {
    if (e.target.id === 'schema-preview') {
      e.target.classList.add('hidden');
    }
  });

  document.getElementById('copy-schema')?.addEventListener('click', copySchema);
  document.getElementById('insert-single')?.addEventListener('click', insertCurrentPreview);

  // RankMath Helper event listeners
  document.getElementById('test-rankmath-connection')?.addEventListener('click', testRankMathConnection);
  document.getElementById('rm-get-page-info')?.addEventListener('click', rmGetPageInfo);
  document.getElementById('rm-generate-schema')?.addEventListener('click', rmGenerateSchema);
  document.getElementById('rm-insert-schema')?.addEventListener('click', rmInsertSchema);
  document.getElementById('rm-delete-schemas')?.addEventListener('click', rmDeleteSchemas);

  // Load saved results
  loadSavedResults();

  // Load saved RankMath credentials
  loadRankMathCredentials();

  // Activity log controls
  document.getElementById('refresh-logs')?.addEventListener('click', loadActivityLogs);
  document.getElementById('clear-logs')?.addEventListener('click', clearActivityLogs);
  document.getElementById('log-filter')?.addEventListener('change', loadActivityLogs);

  // Load logs on startup
  loadActivityLogs();
});

// Store for generated schemas
let generatedSchemas = [];
let currentPreviewIndex = null;

// Get form values
function getCredentials() {
  return {
    wpUrl: document.getElementById('wpUrl')?.value || '',
    username: document.getElementById('username')?.value || '',
    appPassword: document.getElementById('appPassword')?.value || ''
  };
}

function getOrgInfo() {
  // Build address object if any address fields are filled
  const streetAddress = document.getElementById('streetAddress')?.value || '';
  const addressLocality = document.getElementById('addressLocality')?.value || '';
  const addressRegion = document.getElementById('addressRegion')?.value || '';
  const postalCode = document.getElementById('postalCode')?.value || '';

  let address = null;
  if (streetAddress || addressLocality || addressRegion || postalCode) {
    address = {
      streetAddress,
      addressLocality,
      addressRegion,
      postalCode,
      addressCountry: 'US'
    };
  }

  // Parse areas served - support both newlines and commas
  const areasRaw = document.getElementById('areaServed')?.value || '';
  const areaServed = areasRaw
    .split(/[\n,]+/)  // Split by newlines or commas
    .map(a => a.trim())
    .filter(a => a.length > 0)
    .join(', ');  // Convert back to comma-separated for API

  // Parse sameAs URLs - one per line
  const sameAsRaw = document.getElementById('sameAs')?.value || '';
  const sameAs = sameAsRaw
    .split(/\n+/)
    .map(u => u.trim())
    .filter(u => u.length > 0);

  return {
    orgName: document.getElementById('orgName')?.value || '',
    orgUrl: document.getElementById('orgUrl')?.value || '',
    orgLogo: document.getElementById('orgLogo')?.value || '',
    ogImage: document.getElementById('ogImage')?.value || '',
    areaServed,
    businessType: document.getElementById('businessType')?.value || 'HVACBusiness',
    phone: document.getElementById('phone')?.value || '',
    address,
    sameAs
  };
}

// Auto-detect organization info from website
async function detectOrgInfo() {
  const statusEl = document.getElementById('detect-status');
  const url = document.getElementById('detectUrl')?.value || document.getElementById('wpUrl')?.value;

  if (!url) {
    statusEl.textContent = 'Please enter a URL';
    statusEl.className = 'error';
    return;
  }

  statusEl.textContent = 'Scanning website...';
  statusEl.className = 'loading';

  try {
    const aiConfig = getAIConfig();
    const rmCreds = getRankMathCredentials();
    const response = await fetch('/api/detect-org-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, ...aiConfig, ...rmCreds })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Detection failed');
    }

    const org = data.orgInfo;

    // Populate form fields
    if (org.name) {
      const nameEl = document.getElementById('orgName');
      if (nameEl) nameEl.value = org.name;
    }

    if (org.url) {
      const urlEl = document.getElementById('orgUrl');
      if (urlEl) urlEl.value = org.url;

      // Also set WP URL if empty
      const wpUrlEl = document.getElementById('wpUrl');
      if (wpUrlEl && !wpUrlEl.value) wpUrlEl.value = org.url;
    }

    if (org.logo) {
      const logoEl = document.getElementById('orgLogo');
      if (logoEl) logoEl.value = org.logo;
    }

    if (org.phone) {
      const phoneEl = document.getElementById('phone');
      if (phoneEl) phoneEl.value = org.phone;
    }

    if (org.serviceAreas && org.serviceAreas.length > 0) {
      const areaEl = document.getElementById('areaServed');
      if (areaEl) areaEl.value = org.serviceAreas.join(', ');
    }

    if (org.businessType) {
      const typeEl = document.getElementById('businessType');
      if (typeEl) {
        // Try to match the detected type
        for (const option of typeEl.options) {
          if (option.value === org.businessType) {
            typeEl.value = org.businessType;
            break;
          }
        }
      }
    }

    // Populate address fields if detected
    if (org.address) {
      if (org.address.streetAddress) {
        const streetEl = document.getElementById('streetAddress');
        if (streetEl) streetEl.value = org.address.streetAddress;
      }
      if (org.address.addressLocality) {
        const cityEl = document.getElementById('addressLocality');
        if (cityEl) cityEl.value = org.address.addressLocality;
      }
      if (org.address.addressRegion) {
        const stateEl = document.getElementById('addressRegion');
        if (stateEl) stateEl.value = org.address.addressRegion;
      }
      if (org.address.postalCode) {
        const zipEl = document.getElementById('postalCode');
        if (zipEl) zipEl.value = org.address.postalCode;
      }
    }

    // Populate social profiles / sameAs
    if (org.socialProfiles && org.socialProfiles.length > 0) {
      const sameAsEl = document.getElementById('sameAs');
      if (sameAsEl) sameAsEl.value = org.socialProfiles.join('\n');
    }

    // Build summary of what was found
    const found = [];
    if (org.name) found.push('name');
    if (org.logo) found.push('logo');
    if (org.phone) found.push('phone');
    if (org.address) found.push('address');
    if (org.serviceAreas?.length) found.push(`${org.serviceAreas.length} areas`);
    if (org.socialProfiles?.length) found.push(`${org.socialProfiles.length} social`);
    if (org.businessType) found.push(org.businessType);

    statusEl.textContent = `Found: ${found.join(', ')}`;
    statusEl.className = 'success';

  } catch (error) {
    statusEl.textContent = `Error: ${error.message}`;
    statusEl.className = 'error';
  }
}

// Test WordPress connection
async function testConnection() {
  const statusEl = document.getElementById('connection-status');
  const { wpUrl, username, appPassword } = getCredentials();

  if (!wpUrl || !username || !appPassword) {
    statusEl.textContent = 'Please fill in all credentials';
    statusEl.className = 'status-error';
    return;
  }

  statusEl.textContent = 'Testing...';
  statusEl.className = 'status-pending';

  try {
    const response = await fetch('/api/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wpUrl, username, appPassword })
    });

    const data = await response.json();

    if (data.success) {
      statusEl.textContent = `Connected as: ${data.user}`;
      statusEl.className = 'status-success';
    } else {
      throw new Error(data.error || 'Connection failed');
    }
  } catch (error) {
    statusEl.textContent = `Failed: ${error.message}`;
    statusEl.className = 'status-error';
  }
}

// Check if org info is filled - if not, will auto-detect
function isOrgInfoFilled() {
  const orgName = document.getElementById('orgName')?.value?.trim();
  const areaServed = document.getElementById('areaServed')?.value?.trim();
  return orgName && orgName !== 'Organization' && areaServed;
}

// Validate org info - now lenient because we auto-detect
function validateOrgInfo() {
  // Always allow - we'll auto-detect if needed
  // Just show a warning if nothing is filled
  if (!isOrgInfoFilled()) {
    const proceed = confirm(
      'Organization info is not filled in.\n\n' +
      'The system will auto-detect business info from the target website.\n\n' +
      'For best results, fill in Organization Name, Areas Served, and Address.\n\n' +
      'Continue anyway with auto-detection?'
    );
    return proceed;
  }
  return true;
}

// Handle single URL submission (DRY RUN - preview only)
async function handleSingleUrl(e) {
  e.preventDefault();

  const url = document.getElementById('singleUrl').value;
  if (!url) return;

  const resultsEl = document.getElementById('results');
  const schemasContainer = document.getElementById('schemas-container');

  resultsEl.classList.remove('hidden');

  // Check if AI is configured
  const aiConfig = getAIConfig();
  const useAI = aiConfig.provider && aiConfig.apiKey;

  if (useAI) {
    schemasContainer.innerHTML = '<p>AI is analyzing page and generating schemas...</p>';
  } else {
    schemasContainer.innerHTML = '<p>Generating schema preview... (Configure AI for better results)</p>';
  }

  try {
    let data;

    if (useAI) {
      // Use AI-powered schema generation
      const rmCreds = getRankMathCredentials();
      const response = await fetch('/api/ai/generate-schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          orgInfo: getOrgInfo(),
          provider: aiConfig.provider,
          model: aiConfig.model,
          apiKey: aiConfig.apiKey,
          ...rmCreds
        })
      });

      data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate schema');
      }

      // Convert AI response to our format
      data.schema = combineSchemas(data.schemas);
      data.schemaTypes = data.schemas.map(s => s.type);
      data.aiGenerated = true;
      data.tokensUsed = data.tokensUsed || 0;
    } else {
      // Fallback to regular generation
      const response = await fetch('/api/generate-schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          ...getOrgInfo()
        })
      });

      data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate schema');
      }
    }

    // Mark as preview (not yet inserted)
    data.status = 'preview';
    generatedSchemas = [data];
    displaySchemas(generatedSchemas);
    saveResults(generatedSchemas);

    document.getElementById('insert-controls')?.classList.remove('hidden');

    // Show AI info if used
    if (data.aiGenerated) {
      updateFilterCounts();
    }
  } catch (error) {
    schemasContainer.innerHTML = `<p class="status-error">Error: ${error.message}</p>`;
  }
}

// Combine multiple schemas into @graph format
function combineSchemas(schemas) {
  if (!schemas || schemas.length === 0) return {};

  // Helper: get the actual schema object whether wrapped or not
  function getSchema(s) {
    if (s.schema && typeof s.schema === 'object') return s.schema;
    if (s['@type']) return s; // Raw schema object
    return s;
  }

  if (schemas.length === 1) {
    return getSchema(schemas[0]);
  }

  return {
    "@context": "https://schema.org",
    "@graph": schemas.map(s => {
      const schema = { ...getSchema(s) };
      delete schema["@context"]; // Remove individual @context
      return schema;
    })
  };
}

// Get AI configuration
function getAIConfig() {
  const provider = document.getElementById('aiProvider')?.value || '';
  const model = document.getElementById('aiModel')?.value || '';
  let apiKey = '';

  if (provider === 'openai') {
    apiKey = document.getElementById('openaiApiKey')?.value || '';
  } else if (provider === 'gemini') {
    apiKey = document.getElementById('geminiApiKey')?.value || '';
  }

  return { provider, model, apiKey };
}

// Update paste URL count
function updatePasteUrlCount() {
  const textarea = document.getElementById('pasteUrls');
  const countEl = document.getElementById('paste-url-count');
  if (!textarea || !countEl) return;

  const urls = parseUrlsFromText(textarea.value);
  countEl.textContent = urls.length;
}

// Parse URLs from pasted text
function parseUrlsFromText(text) {
  if (!text || !text.trim()) return [];

  // Split by newlines, commas, or spaces
  const lines = text.split(/[\n,]+/).map(line => line.trim()).filter(line => line);

  // Filter valid URLs
  const urls = [];
  for (const line of lines) {
    // Try to extract URL from line (handle cases where there's extra text)
    const urlMatch = line.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      urls.push(urlMatch[0]);
    }
  }

  return [...new Set(urls)]; // Remove duplicates
}

// Handle paste URLs submission — delegates to processMultipleUrls
async function handlePasteUrls(e) {
  e.preventDefault();

  const textarea = document.getElementById('pasteUrls');
  const urls = parseUrlsFromText(textarea.value);

  if (urls.length === 0) {
    alert('Please paste at least one valid URL');
    return;
  }

  await processMultipleUrls(urls);
}

// Process multiple URLs with AI support (DRY RUN - preview only)
async function processMultipleUrls(selectedUrls) {

  if (selectedUrls.length === 0) {
    alert('Please select at least one URL');
    return;
  }

  // Validate org info
  if (!validateOrgInfo()) return;

  const resultsEl = document.getElementById('results');
  const schemasContainer = document.getElementById('schemas-container');
  const progressEl = document.getElementById('progress');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');

  resultsEl.classList.remove('hidden');
  progressEl.classList.remove('hidden');
  schemasContainer.innerHTML = '';
  generatedSchemas = [];

  const total = selectedUrls.length;
  let processed = 0;

  // Check if AI is configured
  const aiConfig = getAIConfig();
  const useAI = aiConfig.provider && aiConfig.apiKey;

  for (const url of selectedUrls) {
    try {
      let data;

      if (useAI) {
        progressText.textContent = `AI generating schema ${processed + 1}/${total}: ${url.replace(/https?:\/\/[^/]+/, '')}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minute timeout

        const rmCreds = getRankMathCredentials();
        const response = await fetch('/api/ai/generate-schema', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            orgInfo: getOrgInfo(),
            provider: aiConfig.provider,
            model: aiConfig.model,
            apiKey: aiConfig.apiKey,
            ...rmCreds
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        data = await response.json();

        if (response.ok) {
          data.schema = combineSchemas(data.schemas);
          data.schemaTypes = data.schemas.map(s => s.type);
          data.aiGenerated = true;
        }
      } else {
        progressText.textContent = `Generating schema ${processed + 1}/${total}: ${url.replace(/https?:\/\/[^/]+/, '')}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minute timeout

        const response = await fetch('/api/generate-schema', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            ...getOrgInfo()
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        data = await response.json();
      }

      if (data && !data.error) {
        data.status = 'preview';
        generatedSchemas.push(data);
      } else {
        generatedSchemas.push({ url, error: data?.error || 'Generation failed', status: 'error' });
      }
    } catch (error) {
      const msg = error.name === 'AbortError'
        ? `Request timed out for ${url}`
        : `${error.message} (${url})`;
      generatedSchemas.push({ url, error: msg, status: 'error' });
    }

    processed++;
    const progress = Math.round((processed / total) * 100);
    progressBar.style.setProperty('--progress', progress + '%');
  }

  progressEl.classList.add('hidden');
  displaySchemas(generatedSchemas);
  saveResults(generatedSchemas);

  document.getElementById('insert-controls')?.classList.remove('hidden');
  updateFilterCounts();
}

// Display generated schemas with selection checkboxes
function displaySchemas(schemas) {
  const container = document.getElementById('schemas-container');
  container.innerHTML = '';

  schemas.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'schema-item' + (item.status !== 'error' ? ' selected' : '');
    div.dataset.index = index;

    if (item.error) {
      div.innerHTML = `
        <div class="schema-header">
          <h4>${truncateUrl(item.url)}</h4>
          <span class="status-badge error">Error</span>
        </div>
        <div class="schema-body">
          <p class="status-error">${item.error}</p>
        </div>
      `;
    } else {
      const typeClass = item.pageType === 'service' ? 'service' : 'article';
      const statusBadge = item.status === 'inserted'
        ? '<span class="status-badge inserted">Inserted</span>'
        : '<span class="status-badge preview">Preview</span>';

      // Show schema types included
      const schemaTypes = item.schemaTypes || getSchemaTypesFromGraph(item.schema);
      const schemaTypeBadges = schemaTypes.map(t =>
        `<span class="schema-type-badge">${t}</span>`
      ).join('');

      // Show validation status
      const validationHtml = item.validation
        ? `<span class="validation-status ${item.validation.valid ? 'valid' : 'invalid'}">
             ${item.validation.valid ? '✓ Valid' : '⚠ Issues'}
           </span>`
        : '';

      // Show Google compliance badge
      const complianceBadge = getComplianceBadge(item);

      // Show insertion verification badge (only for inserted schemas)
      const verificationBadge = getVerificationBadge(item);

      // Show extracted data summary
      const dataSummary = item.pageData
        ? `<div class="data-summary">
             ${item.pageData.faqCount ? `<span class="data-badge">📋 ${item.pageData.faqCount} FAQs</span>` : ''}
             ${item.pageData.phone ? `<span class="data-badge">📞 Phone detected</span>` : ''}
             ${item.pageData.serviceAreas?.length ? `<span class="data-badge">📍 ${item.pageData.serviceAreas.length} areas</span>` : ''}
           </div>`
        : '';

      // Show AI verification results
      let aiSection = '';
      if (item.aiVerification) {
        const v = item.aiVerification;
        const corrections = [];

        // Check for type correction suggestion
        if (item.aiSuggestedType && item.aiSuggestedType !== item.pageType) {
          corrections.push(`Page type: AI suggests "${item.aiSuggestedType}" (${Math.round(v.pageType.confidence * 100)}% confident)`);
        }

        // Check for location corrections
        if (v.location && v.location.city) {
          corrections.push(`Location detected: ${v.location.city}${v.location.state ? ', ' + v.location.state : ''}`);
        }

        // Build AI section HTML
        aiSection = `<div class="ai-verification-results">`;

        // AI verified badge
        aiSection += `<span class="ai-verified-badge ${corrections.length > 0 ? 'warning' : ''}">
          🤖 AI Verified (${item.aiProvider})
        </span>`;

        // Show corrections if any
        if (corrections.length > 0) {
          aiSection += `<div class="ai-corrections"><h5>⚠ AI Suggestions:</h5><ul>`;
          corrections.forEach(c => aiSection += `<li>${c}</li>`);
          aiSection += `</ul></div>`;
        }

        // Show found reviews
        if (item.aiReviews && item.aiReviews.length > 0) {
          aiSection += `<div class="ai-reviews"><h5>📝 Reviews Found (${item.aiReviews.length}):</h5>`;
          item.aiReviews.slice(0, 2).forEach(r => {
            aiSection += `<p>"${r.text.substring(0, 100)}..." ${r.rating ? '⭐' + r.rating : ''}</p>`;
          });
          aiSection += `</div>`;
        }

        // Show missed FAQs
        if (item.aiMissedFaqs && item.aiMissedFaqs.length > 0) {
          aiSection += `<div class="ai-faqs"><h5>❓ Missed FAQs Found (${item.aiMissedFaqs.length}):</h5>`;
          item.aiMissedFaqs.slice(0, 2).forEach(f => {
            aiSection += `<p><strong>Q:</strong> ${f.question.substring(0, 80)}...</p>`;
          });
          aiSection += `</div>`;
        }

        aiSection += `</div>`;
      }

      div.innerHTML = `
        <div class="schema-header">
          <label class="checkbox-label">
            <input type="checkbox" class="schema-select" data-index="${index}" ${item.status !== 'inserted' ? 'checked' : ''} ${item.status === 'inserted' ? 'disabled' : ''}>
            <h4>${truncateUrl(item.url)}</h4>
          </label>
          <div class="schema-actions">
            <span class="url-type ${typeClass}">${item.pageType}</span>
            ${statusBadge}
            ${verificationBadge}
            ${complianceBadge}
            ${validationHtml}
            <button class="btn btn-secondary btn-small" onclick="showSchemaDiff(${index})">Compare</button>
            <button class="btn btn-secondary" onclick="previewSchema(${index})">View Full Schema</button>
          </div>
        </div>
        <div class="schema-types">
          ${schemaTypeBadges}
        </div>
        ${dataSummary}
        ${aiSection}
        <div class="schema-body">
          <pre>${JSON.stringify(item.schema, null, 2)}</pre>
        </div>
      `;
    }

    container.appendChild(div);
  });

  // Add event listeners to checkboxes
  document.querySelectorAll('.schema-select').forEach(cb => {
    cb.addEventListener('change', () => updateSchemaItemStyle(cb));
  });

  // Update filter counts
  updateFilterCounts();
}

// Extract schema types from @graph structure
function getSchemaTypesFromGraph(schema) {
  if (schema && schema['@graph']) {
    return schema['@graph'].map(s => s['@type']).filter(Boolean);
  }
  if (schema && schema['@type']) {
    return [schema['@type']];
  }
  return [];
}

// Filter schemas by type
function filterSchemasByType(filter) {
  const items = document.querySelectorAll('.schema-item');

  items.forEach((item, index) => {
    const schema = generatedSchemas[index];
    if (!schema) return;

    if (filter === 'all') {
      item.classList.remove('filter-hidden');
    } else if (filter === 'service' && schema.pageType === 'service') {
      item.classList.remove('filter-hidden');
    } else if (filter === 'location' && schema.pageType === 'location') {
      item.classList.remove('filter-hidden');
    } else if (filter === 'article' && schema.pageType === 'article') {
      item.classList.remove('filter-hidden');
    } else {
      item.classList.add('filter-hidden');
    }
  });

  // Update select all checkbox to only affect visible items
  const selectAllCheckbox = document.getElementById('select-all-schemas');
  if (selectAllCheckbox) {
    const visibleCheckboxes = document.querySelectorAll('.schema-item:not(.filter-hidden) .schema-select:not(:disabled)');
    const allChecked = Array.from(visibleCheckboxes).every(cb => cb.checked);
    selectAllCheckbox.checked = allChecked;
  }
}

// Update filter counts
function updateFilterCounts() {
  const all = generatedSchemas.length;
  const services = generatedSchemas.filter(s => s.pageType === 'service' && !s.error).length;
  const locations = generatedSchemas.filter(s => s.pageType === 'location' && !s.error).length;
  const articles = generatedSchemas.filter(s => s.pageType === 'article' && !s.error).length;
  const preview = generatedSchemas.filter(s => s.status === 'preview' && !s.error).length;
  const inserted = generatedSchemas.filter(s => s.status === 'inserted').length;

  const pendingServices = generatedSchemas.filter(s => s.pageType === 'service' && s.status === 'preview' && !s.error).length;
  const pendingLocations = generatedSchemas.filter(s => s.pageType === 'location' && s.status === 'preview' && !s.error).length;
  const pendingArticles = generatedSchemas.filter(s => s.pageType === 'article' && s.status === 'preview' && !s.error).length;

  // Update filter tab counts
  document.getElementById('count-all').textContent = all;
  document.getElementById('count-service').textContent = services;
  document.getElementById('count-location').textContent = locations;
  document.getElementById('count-article').textContent = articles;
  document.getElementById('count-preview').textContent = preview;
  document.getElementById('count-inserted').textContent = inserted;

  // Update bulk publish button counts
  document.getElementById('btn-count-service').textContent = pendingServices;
  document.getElementById('btn-count-location').textContent = pendingLocations;
  document.getElementById('btn-count-article').textContent = pendingArticles;

  // Disable buttons if nothing to publish
  const servicesBtn = document.getElementById('insert-all-services');
  const locationsBtn = document.getElementById('insert-all-locations');
  const articlesBtn = document.getElementById('insert-all-articles');
  if (servicesBtn) servicesBtn.disabled = pendingServices === 0;
  if (locationsBtn) locationsBtn.disabled = pendingLocations === 0;
  if (articlesBtn) articlesBtn.disabled = pendingArticles === 0;

  // Show filter controls if we have schemas
  if (all > 0) {
    document.getElementById('filter-controls')?.classList.remove('hidden');
  }
}

// Insert all schemas by type
async function insertAllByType(pageType) {
  const creds = getRankMathCredentials();

  if (!creds.siteUrl || !creds.secretToken) {
    alert('Please connect to your site first (Site URL and Secret Token in the Connect section)');
    return;
  }

  const toInsert = generatedSchemas
    .map((schema, index) => ({ schema, index }))
    .filter(({ schema }) =>
      schema.pageType === pageType &&
      schema.status === 'preview' &&
      !schema.error
    );

  if (toInsert.length === 0) {
    const typeNames = { service: 'service pages', location: 'location pages', article: 'blog posts' };
    alert(`No pending ${typeNames[pageType] || pageType} to publish`);
    return;
  }

  const typeLabels = { service: 'service pages', location: 'location pages', article: 'blog posts' };
  const typeLabel = typeLabels[pageType] || pageType;
  const confirmMsg = `You are about to publish schemas for ${toInsert.length} ${typeLabel}.\n\nThis will update:\n${toInsert.slice(0, 5).map(({ schema }) => '- ' + truncateUrl(schema.url)).join('\n')}${toInsert.length > 5 ? `\n... and ${toInsert.length - 5} more` : ''}\n\nContinue?`;

  if (!confirm(confirmMsg)) {
    return;
  }

  let success = 0;
  let failed = 0;
  const errors = [];

  // Show progress
  const btn = pageType === 'service'
    ? document.getElementById('insert-all-services')
    : pageType === 'location'
    ? document.getElementById('insert-all-locations')
    : document.getElementById('insert-all-articles');
  const originalText = btn ? btn.textContent : '';
  if (btn) btn.disabled = true;

  for (let i = 0; i < toInsert.length; i++) {
    const { schema: item, index } = toInsert[i];
    if (btn) btn.textContent = `Publishing ${i + 1}/${toInsert.length}...`;

    try {
      const response = await fetch('/api/rankmath/insert-by-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...creds, pageUrl: item.url, schema: item.schema })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        generatedSchemas[index].status = 'inserted';
        success++;
      } else {
        errors.push(`${truncateUrl(item.url)}: ${data.error || 'Unknown error'}`);
        failed++;
      }
    } catch (error) {
      errors.push(`${truncateUrl(item.url)}: ${error.message}`);
      failed++;
    }
  }

  // Update button immediately to show completion
  if (btn) {
    btn.textContent = 'Finishing...';
  }

  // Use setTimeout to allow UI to update before heavy operations
  setTimeout(() => {
    try {
      // Refresh display
      displaySchemas(generatedSchemas);
      saveResults(generatedSchemas);
      updateFilterCounts();

      // Reapply current filter
      const activeFilter = document.querySelector('.filter-tab.active');
      if (activeFilter) {
        filterSchemasByType(activeFilter.dataset.filter);
      }
    } catch (e) {
      console.error('Error updating display:', e);
    }

    if (btn) {
      btn.textContent = originalText;
      btn.disabled = false;
    }

    let resultMsg = `Bulk publish complete!\n\nSuccessfully inserted: ${success}\nFailed: ${failed}`;
    if (errors.length > 0) {
      resultMsg += `\n\nErrors:\n${errors.slice(0, 5).join('\n')}`;
      if (errors.length > 5) {
        resultMsg += `\n... and ${errors.length - 5} more errors`;
      }
    }
    alert(resultMsg);
  }, 100);
}

function updateSchemaItemStyle(checkbox) {
  const item = checkbox.closest('.schema-item');
  if (checkbox.checked) {
    item.classList.add('selected');
  } else {
    item.classList.remove('selected');
  }
}

// Truncate URL for display
function truncateUrl(url) {
  if (url.length > 60) {
    return url.substring(0, 57) + '...';
  }
  return url;
}

// Preview schema in modal
function previewSchema(index) {
  const item = generatedSchemas[index];
  currentPreviewIndex = index;

  document.getElementById('preview-url').textContent = item.url;

  const typeEl = document.getElementById('preview-type');
  typeEl.textContent = item.pageType;
  typeEl.className = 'preview-type ' + item.pageType;

  // Show schema types included
  const schemaTypes = item.schemaTypes || getSchemaTypesFromGraph(item.schema);
  const schemaTypesEl = document.getElementById('preview-schema-types');
  if (schemaTypesEl) {
    schemaTypesEl.innerHTML = schemaTypes.map(t =>
      `<span class="schema-type-badge">${t}</span>`
    ).join('');
  }

  // Show validation info
  const validationEl = document.getElementById('preview-validation');
  if (validationEl && item.validation) {
    if (item.validation.valid) {
      validationEl.innerHTML = `<span class="validation-status valid">✓ ${item.validation.schemaCount} schemas - All valid</span>`;
    } else {
      validationEl.innerHTML = `<span class="validation-status invalid">⚠ ${item.validation.errors.length} error(s)</span>`;
    }
  }

  // Show Google compliance details
  const complianceContainer = document.getElementById('preview-compliance');
  if (complianceContainer) {
    complianceContainer.innerHTML = getComplianceDetails(item);
  }

  document.getElementById('schema-json').textContent = JSON.stringify(item.schema, null, 2);

  // Update button state
  const insertBtn = document.getElementById('insert-single');
  if (item.status === 'inserted') {
    insertBtn.textContent = 'Already Inserted';
    insertBtn.disabled = true;
  } else {
    insertBtn.textContent = 'Publish to WordPress via RankMath';
    insertBtn.disabled = false;
  }

  document.getElementById('schema-preview').classList.remove('hidden');
}

// Copy single schema to clipboard
function copySchema() {
  if (currentPreviewIndex === null) return;

  const item = generatedSchemas[currentPreviewIndex];
  const schemaText = JSON.stringify(item.schema, null, 2);

  navigator.clipboard.writeText(schemaText).then(() => {
    alert('Schema JSON copied!\n\nIn RankMath: Edit page → Schema tab → Add Schema → Custom Schema → Code Validation → Paste');
  });
}

// Copy all schemas to clipboard (just the schema objects for RankMath)
// Save schemas as JSON file
function saveAsJson() {
  const selectedSchemas = generatedSchemas
    .filter(s => !s.error)
    .map(s => ({
      url: s.url,
      pageType: s.pageType,
      schemaTypes: s.schemaTypes || [],
      schema: s.schema,
      aiGenerated: s.aiGenerated || false
    }));

  if (selectedSchemas.length === 0) {
    alert('No schemas to save');
    return;
  }

  const exportData = {
    exportDate: new Date().toISOString(),
    schemaCount: selectedSchemas.length,
    schemas: selectedSchemas
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `schemas-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function copyAllSchemas() {
  const validSchemas = generatedSchemas
    .filter(s => !s.error)
    .map(s => s.schema);

  if (validSchemas.length === 1) {
    navigator.clipboard.writeText(JSON.stringify(validSchemas[0], null, 2)).then(() => {
      alert('Schema copied to clipboard!');
    });
  } else {
    navigator.clipboard.writeText(JSON.stringify(validSchemas, null, 2)).then(() => {
      alert(`${validSchemas.length} schemas copied to clipboard!`);
    });
  }
}

// Insert current preview schema
async function insertCurrentPreview() {
  if (currentPreviewIndex === null) return;

  const success = await insertSchema(currentPreviewIndex);
  if (success) {
    document.getElementById('schema-preview').classList.add('hidden');
  }
}

// Insert single schema
async function insertSchema(index) {
  const item = generatedSchemas[index];
  const creds = getRankMathCredentials();

  if (!creds.siteUrl || !creds.secretToken) {
    alert('Please connect to your site first (Site URL and Secret Token in the Connect section)');
    return false;
  }

  // Guard against inserting empty schemas
  if (!item.schema || Object.keys(item.schema).length === 0) {
    alert('Schema is empty — cannot insert. Try regenerating the schema first.');
    return false;
  }

  try {
    const response = await fetch('/api/rankmath/insert-by-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...creds, pageUrl: item.url, schema: item.schema })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      alert(`Schema successfully inserted for:\n${item.url}\n\nInserted via RankMath.`);
      item.status = 'inserted';
      displaySchemas(generatedSchemas);
      saveResults(generatedSchemas);
      return true;
    } else {
      throw new Error(data.error || 'Insert failed');
    }
  } catch (error) {
    alert(`Failed to insert schema: ${error.message}`);
    return false;
  }
}

// Insert only selected schemas (respects current filter)
async function insertSelectedSchemas() {
  const creds = getRankMathCredentials();

  if (!creds.siteUrl || !creds.secretToken) {
    alert('Please connect to your site first (Site URL and Secret Token in the Connect section)');
    return;
  }

  // Only get checked items that are visible (not filtered out)
  const selectedIndices = Array.from(document.querySelectorAll('.schema-item:not(.filter-hidden) .schema-select:checked'))
    .map(cb => parseInt(cb.dataset.index))
    .filter(idx => generatedSchemas[idx] && generatedSchemas[idx].status !== 'inserted');

  if (selectedIndices.length === 0) {
    alert('No schemas selected for insertion');
    return;
  }

  const confirmMsg = `You are about to insert ${selectedIndices.length} schema(s) to WordPress via RankMath.\n\nThis will update the following pages:\n${selectedIndices.map(i => '- ' + truncateUrl(generatedSchemas[i].url)).join('\n')}\n\nContinue?`;

  if (!confirm(confirmMsg)) {
    return;
  }

  let success = 0;
  let failed = 0;
  const errors = [];

  for (const index of selectedIndices) {
    const item = generatedSchemas[index];
    try {
      const response = await fetch('/api/rankmath/insert-by-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...creds, pageUrl: item.url, schema: item.schema })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        item.status = 'inserted';
        success++;
      } else {
        errors.push(`${truncateUrl(item.url)}: ${data.error || 'Unknown error'}`);
        failed++;
      }
    } catch (error) {
      errors.push(`${truncateUrl(item.url)}: ${error.message}`);
      failed++;
    }
  }

  // Use setTimeout to allow UI to update before heavy operations
  setTimeout(() => {
    try {
      displaySchemas(generatedSchemas);
      saveResults(generatedSchemas);
      updateFilterCounts();

      // Reapply current filter
      const activeFilter = document.querySelector('.filter-tab.active');
      if (activeFilter) {
        filterSchemasByType(activeFilter.dataset.filter);
      }
    } catch (e) {
      console.error('Error updating display:', e);
    }

    let resultMsg = `Insertion complete!\n\nSuccessfully inserted: ${success}\nFailed: ${failed}`;
    if (errors.length > 0) {
      resultMsg += `\n\nErrors:\n${errors.join('\n')}`;
    }
    alert(resultMsg);
  }, 100);
}

// Save results to localStorage
function saveResults(schemas) {
  try {
    const existing = JSON.parse(localStorage.getItem('schemaResults') || '[]');
    const updated = [...schemas.filter(s => !s.error), ...existing].slice(0, 100);
    localStorage.setItem('schemaResults', JSON.stringify(updated));
    updateStats();
  } catch (e) {
    console.error('Failed to save results:', e);
  }
}

// Load saved results
function loadSavedResults() {
  try {
    const saved = JSON.parse(localStorage.getItem('schemaResults') || '[]');
    const listEl = document.getElementById('results-list');

    if (listEl && saved.length > 0) {
      listEl.innerHTML = '';
      saved.slice(0, 20).forEach(item => {
        const statusClass = item.status === 'inserted' ? 'inserted' : 'preview';
        const statusText = item.status === 'inserted' ? 'Inserted' : 'Preview Only';
        const div = document.createElement('div');
        div.className = 'schema-item';
        div.innerHTML = `
          <div class="schema-header">
            <h4>${truncateUrl(item.url)}</h4>
            <div class="schema-actions">
              <span class="url-type ${item.pageType}">${item.pageType}</span>
              <span class="status-badge ${statusClass}">${statusText}</span>
            </div>
          </div>
        `;
        listEl.appendChild(div);
      });
    }

    updateStats();
  } catch (e) {
    console.error('Failed to load results:', e);
  }
}

// Update statistics
function updateStats() {
  try {
    const saved = JSON.parse(localStorage.getItem('schemaResults') || '[]');

    const totalGen = document.getElementById('total-generated');
    const totalIns = document.getElementById('total-inserted');
    const articleCnt = document.getElementById('article-count');
    const serviceCnt = document.getElementById('service-count');

    if (totalGen) totalGen.textContent = saved.length;
    if (totalIns) totalIns.textContent = saved.filter(s => s.status === 'inserted').length;
    if (articleCnt) articleCnt.textContent = saved.filter(s => s.pageType === 'article').length;
    if (serviceCnt) serviceCnt.textContent = saved.filter(s => s.pageType === 'service').length;
  } catch (e) {
    // Ignore
  }
}

// ==================== AI Functions ====================

// Store AI providers info
let aiProviders = {};

// Save API key to localStorage
function saveApiKey(provider, key) {
  try {
    if (key && key.trim()) {
      localStorage.setItem(`apiKey_${provider}`, key.trim());
    } else {
      localStorage.removeItem(`apiKey_${provider}`);
    }
  } catch (e) {
    console.error('Failed to save API key:', e);
  }
}

// Load saved API keys from localStorage
function loadSavedApiKeys() {
  try {
    const openaiKey = localStorage.getItem('apiKey_openai');
    const geminiKey = localStorage.getItem('apiKey_gemini');
    const savedProvider = localStorage.getItem('aiProvider');

    // Restore OpenAI key
    if (openaiKey) {
      const openaiInput = document.getElementById('openaiApiKey');
      if (openaiInput) openaiInput.value = openaiKey;
    }

    // Restore Gemini key
    if (geminiKey) {
      const geminiInput = document.getElementById('geminiApiKey');
      if (geminiInput) geminiInput.value = geminiKey;
    }

    // Restore selected provider
    if (savedProvider) {
      const providerSelect = document.getElementById('aiProvider');
      if (providerSelect) {
        providerSelect.value = savedProvider;
        updateAIModels();
      }
    }

    // Update status after loading
    setTimeout(checkUIApiKey, 100);
  } catch (e) {
    console.error('Failed to load API keys:', e);
  }
}

// Load available AI providers
async function loadAIProviders() {
  try {
    const response = await fetch('/api/ai/providers');
    const data = await response.json();

    if (data.success) {
      aiProviders = data.providers;
      updateAIStatus();

      // Now that providers are loaded, restore saved settings
      loadSavedApiKeys();
    }
  } catch (error) {
    console.error('Failed to load AI providers:', error);
  }
}

// Update AI status display
function updateAIStatus() {
  const statusEl = document.getElementById('ai-status');
  if (!statusEl) return;

  const configured = [];
  const notConfigured = [];

  for (const [key, provider] of Object.entries(aiProviders)) {
    if (provider.configured) {
      configured.push(provider.name);
    } else {
      notConfigured.push(provider.name);
    }
  }

  if (configured.length > 0) {
    statusEl.textContent = `✓ Configured via .env: ${configured.join(', ')}`;
    statusEl.className = 'ai-status configured';
  } else {
    statusEl.textContent = 'Enter your API key above to use AI verification.';
    statusEl.className = 'ai-status not-configured';
  }
}

// Check if API key is entered in UI and update status
function checkUIApiKey() {
  const statusEl = document.getElementById('ai-status');
  if (!statusEl) return;

  const provider = document.getElementById('aiProvider')?.value;
  const openaiKey = document.getElementById('openaiApiKey')?.value;
  const geminiKey = document.getElementById('geminiApiKey')?.value;

  // Check if provider is selected and has a key (either from UI or .env)
  if (provider === 'openai' && openaiKey) {
    statusEl.textContent = '✓ OpenAI API key saved';
    statusEl.className = 'ai-status configured';
  } else if (provider === 'gemini' && geminiKey) {
    statusEl.textContent = '✓ Gemini API key saved';
    statusEl.className = 'ai-status configured';
  } else if (provider && aiProviders[provider]?.configured) {
    statusEl.textContent = `✓ ${aiProviders[provider].name} configured via .env`;
    statusEl.className = 'ai-status configured';
  } else if (provider) {
    statusEl.textContent = `Enter your ${provider === 'openai' ? 'OpenAI' : 'Gemini'} API key above.`;
    statusEl.className = 'ai-status not-configured';
  } else {
    updateAIStatus(); // Fall back to default status
  }
}

// Update model dropdown based on selected provider
function updateAIModels() {
  const providerSelect = document.getElementById('aiProvider');
  const modelSelect = document.getElementById('aiModel');

  if (!providerSelect || !modelSelect) return;

  const provider = providerSelect.value;
  modelSelect.innerHTML = '';

  // Show/hide API key inputs
  const openaiGroup = document.getElementById('openai-key-group');
  const geminiGroup = document.getElementById('gemini-key-group');
  if (openaiGroup) openaiGroup.style.display = provider === 'openai' ? 'block' : 'none';
  if (geminiGroup) geminiGroup.style.display = provider === 'gemini' ? 'block' : 'none';

  if (!provider || !aiProviders[provider]) {
    modelSelect.innerHTML = '<option value="">-- Select model after provider --</option>';
    return;
  }

  // Get saved model for this provider
  let savedModel = null;
  try {
    savedModel = localStorage.getItem(`aiModel_${provider}`);
  } catch (e) {}

  const models = aiProviders[provider].models || [];
  for (const model of models) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name;
    // Use saved model or default
    if (savedModel && model.id === savedModel) {
      option.selected = true;
    } else if (!savedModel && model.default) {
      option.selected = true;
    }
    modelSelect.appendChild(option);
  }

  // Add listener to save model selection
  modelSelect.onchange = () => {
    try {
      localStorage.setItem(`aiModel_${provider}`, modelSelect.value);
    } catch (e) {}
  };
}

// Get selected AI settings
function getAISettings() {
  const provider = document.getElementById('aiProvider')?.value || '';
  return {
    provider,
    model: document.getElementById('aiModel')?.value || '',
    apiKey: provider === 'openai'
      ? document.getElementById('openaiApiKey')?.value || ''
      : document.getElementById('geminiApiKey')?.value || ''
  };
}

// Verify schemas with AI
async function verifyWithAI(mode) {
  const ai = getAISettings();

  if (!ai.provider) {
    alert('Please select an AI provider first');
    return;
  }

  // Check for API key (either from UI or warn that .env must be configured)
  const providerInfo = aiProviders[ai.provider];
  if (!ai.apiKey && (!providerInfo || !providerInfo.configured)) {
    alert(`Please enter your ${ai.provider === 'openai' ? 'OpenAI' : 'Gemini'} API key in the field above, or configure it in the .env file.`);
    return;
  }

  // Get indices to verify
  let indices = [];
  if (mode === 'selected') {
    indices = Array.from(document.querySelectorAll('.schema-item:not(.filter-hidden) .schema-select:checked'))
      .map(cb => parseInt(cb.dataset.index))
      .filter(idx => generatedSchemas[idx] && !generatedSchemas[idx].error);
  } else {
    indices = generatedSchemas
      .map((s, i) => (!s.error ? i : -1))
      .filter(i => i >= 0);
  }

  if (indices.length === 0) {
    alert('No schemas to verify');
    return;
  }

  const progressEl = document.getElementById('ai-verify-progress');
  const statusEl = document.getElementById('ai-verify-status');
  progressEl?.classList.remove('hidden');

  let verified = 0;
  let errors = 0;

  for (const index of indices) {
    const item = generatedSchemas[index];
    statusEl.textContent = `Verifying ${verified + 1}/${indices.length}: ${truncateUrl(item.url)}...`;

    try {
      const response = await fetch('/api/ai/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: item.url,
          pageData: item.pageData,
          extractedData: {
            pageType: item.pageType,
            location: item.location
          },
          orgInfo: getOrgInfo(),
          provider: ai.provider,
          model: ai.model,
          apiKey: ai.apiKey  // Include API key from UI
        })
      });

      const data = await response.json();

      if (data.success && data.verification) {
        // Store verification results
        generatedSchemas[index].aiVerification = data.verification;
        generatedSchemas[index].aiProvider = data.provider;
        generatedSchemas[index].aiModel = data.model;

        // Check if page type should be corrected
        const v = data.verification;
        if (v.pageType && v.pageType.detected !== item.pageType && v.pageType.confidence > 0.8) {
          generatedSchemas[index].aiSuggestedType = v.pageType.detected;
        }

        // Store extracted reviews
        if (v.reviews && v.reviews.length > 0) {
          generatedSchemas[index].aiReviews = v.reviews;
        }

        // Store missed FAQs
        if (v.faqs && v.faqs.missing && v.faqs.missing.length > 0) {
          generatedSchemas[index].aiMissedFaqs = v.faqs.missing;
        }

        verified++;
      } else {
        errors++;
      }
    } catch (error) {
      console.error('AI verification failed:', error);
      errors++;
    }
  }

  progressEl?.classList.add('hidden');

  // Refresh display
  displaySchemas(generatedSchemas);
  updateFilterCounts();

  alert(`AI Verification Complete!\n\nVerified: ${verified}\nErrors: ${errors}`);
}

// ==================== Schema Insertion Verification ====================

// Verify a single inserted schema
async function verifySingleInsertion(index) {
  const item = generatedSchemas[index];
  if (!item || item.status !== 'inserted') return null;

  const expectedTypes = item.schemaTypes || getSchemaTypesFromGraph(item.schema);

  try {
    const response = await fetch('/api/verify-insertion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: item.url,
        expectedSchemaTypes: expectedTypes
      })
    });

    const data = await response.json();

    if (data.success) {
      generatedSchemas[index].insertionVerified = data.verified;
      generatedSchemas[index].verificationDetails = data;
      return data;
    }
  } catch (error) {
    console.error('Verification failed:', error);
    generatedSchemas[index].insertionVerified = false;
    generatedSchemas[index].verificationError = error.message;
  }

  return null;
}

// Verify all inserted schemas
async function verifyAllInsertions() {
  const insertedSchemas = generatedSchemas
    .map((s, i) => ({ schema: s, index: i }))
    .filter(({ schema }) => schema.status === 'inserted');

  if (insertedSchemas.length === 0) {
    alert('No inserted schemas to verify.\n\nFirst publish schemas to WordPress, then verify.');
    return;
  }

  const progressEl = document.getElementById('ai-verify-progress');
  const statusEl = document.getElementById('ai-verify-status');

  if (progressEl) progressEl.classList.remove('hidden');

  let verified = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < insertedSchemas.length; i++) {
    const { schema: item, index } = insertedSchemas[i];
    if (statusEl) {
      statusEl.textContent = `Verifying ${i + 1}/${insertedSchemas.length}: ${truncateUrl(item.url)}...`;
    }

    const result = await verifySingleInsertion(index);

    if (result && result.verified) {
      verified++;
    } else {
      failed++;
      failures.push({
        url: item.url,
        foundTypes: result?.foundTypes || [],
        missingTypes: result?.missingTypes || [],
        error: result?.error || generatedSchemas[index].verificationError
      });
    }

    // Small delay to avoid hammering the server
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (progressEl) progressEl.classList.add('hidden');

  // Refresh display
  displaySchemas(generatedSchemas);
  saveResults(generatedSchemas);

  // Show results
  let msg = `Verification Complete!\n\n✓ Verified: ${verified}\n✗ Failed: ${failed}`;

  if (failures.length > 0) {
    msg += '\n\n--- Failed Pages ---';
    failures.slice(0, 5).forEach(f => {
      msg += `\n\n${truncateUrl(f.url)}`;
      if (f.error) {
        msg += `\n  Error: ${f.error}`;
      } else if (f.foundTypes.length === 0) {
        msg += '\n  No schema found on page';
      } else {
        msg += `\n  Found: ${f.foundTypes.join(', ')}`;
        if (f.missingTypes.length > 0) {
          msg += `\n  Missing: ${f.missingTypes.join(', ')}`;
        }
      }
    });
    if (failures.length > 5) {
      msg += `\n\n... and ${failures.length - 5} more`;
    }
  }

  alert(msg);
}

// Get verification badge HTML
function getVerificationBadge(item) {
  if (item.status !== 'inserted') {
    return '';
  }

  if (item.insertionVerified === true) {
    return '<span class="verification-badge verified" title="Schema found on page">✓ Live</span>';
  } else if (item.insertionVerified === false) {
    const details = item.verificationDetails;
    let title = 'Schema not found on page';
    if (details && details.foundTypes && details.foundTypes.length > 0) {
      title = `Found: ${details.foundTypes.join(', ')}. Missing: ${details.missingTypes?.join(', ') || 'unknown'}`;
    }
    return `<span class="verification-badge not-verified" title="${title}">✗ Not Found</span>`;
  }

  return '<span class="verification-badge unknown" title="Click Verify to check">? Unverified</span>';
}

// ==================== Google Compliance Verification ====================

// Verify Google compliance for generated schemas
async function verifyGoogleCompliance(index, showAlert = false) {
  const ai = getAISettings();
  const item = generatedSchemas[index];

  if (!item || item.error) return null;

  // First, do quick local validation (instant, no API needed)
  try {
    const localResponse = await fetch('/api/validate-schema', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schema: item.schema })
    });

    const localData = await localResponse.json();
    if (localData.success) {
      generatedSchemas[index].googleValidation = localData.validation;
    }
  } catch (e) {
    console.error('Local validation failed:', e);
  }

  // If AI provider is configured, do full AI verification
  if (ai.provider && (ai.apiKey || aiProviders[ai.provider]?.configured)) {
    try {
      const response = await fetch('/api/ai/verify-google-compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schema: item.schema,
          pageData: item.pageData,
          url: item.url,
          provider: ai.provider,
          model: ai.model,
          apiKey: ai.apiKey
        })
      });

      const data = await response.json();

      if (data.success) {
        generatedSchemas[index].googleCompliance = data;
        generatedSchemas[index].complianceStatus = data.overallStatus;

        if (showAlert) {
          const status = data.overallStatus;
          let msg = `Google Compliance Check: ${status.status.toUpperCase()}\n\n${status.message}`;

          if (data.localValidation.errors.length > 0) {
            msg += `\n\nErrors to fix:\n${data.localValidation.errors.map(e => '• ' + e.message).join('\n')}`;
          }

          if (data.aiVerification.criticalFixes && data.aiVerification.criticalFixes.length > 0) {
            msg += `\n\nAI-detected issues:\n${data.aiVerification.criticalFixes.map(f => '• ' + f.issue).join('\n')}`;
          }

          alert(msg);
        }

        return data;
      }
    } catch (error) {
      console.error('AI compliance check failed:', error);
    }
  }

  return generatedSchemas[index].googleValidation || null;
}

// Verify all schemas for Google compliance
async function verifyAllGoogleCompliance() {
  const ai = getAISettings();

  // Only proceed with AI verification if provider is configured
  const useAI = ai.provider && (ai.apiKey || aiProviders[ai.provider]?.configured);

  const progressEl = document.getElementById('ai-verify-progress');
  const statusEl = document.getElementById('ai-verify-status');

  if (progressEl) progressEl.classList.remove('hidden');

  let verified = 0;
  let passed = 0;
  let failed = 0;

  const indices = generatedSchemas
    .map((s, i) => (!s.error ? i : -1))
    .filter(i => i >= 0);

  for (const index of indices) {
    const item = generatedSchemas[index];
    if (statusEl) {
      statusEl.textContent = `Checking Google compliance ${verified + 1}/${indices.length}: ${truncateUrl(item.url)}...`;
    }

    try {
      const result = await verifyGoogleCompliance(index, false);
      if (result) {
        const status = result.overallStatus || (result.valid ? { canPublish: true } : { canPublish: false });
        if (status.canPublish) {
          passed++;
        } else {
          failed++;
        }
      }
      verified++;
    } catch (e) {
      console.error('Verification failed:', e);
    }
  }

  if (progressEl) progressEl.classList.add('hidden');

  // Refresh display
  displaySchemas(generatedSchemas);
  saveResults(generatedSchemas);

  const aiNote = useAI ? ' (with AI verification)' : ' (local validation only - select AI provider for detailed analysis)';
  alert(`Google Compliance Check Complete${aiNote}\n\nChecked: ${verified}\nReady to publish: ${passed}\nNeeds fixes: ${failed}`);
}

// Display Google compliance status badge
function getComplianceBadge(item) {
  if (!item.googleValidation && !item.googleCompliance) {
    return '<span class="compliance-badge unknown" title="Not verified yet">⏳ Not verified</span>';
  }

  const local = item.googleValidation;
  const ai = item.googleCompliance;

  // Priority: AI result > local result
  if (ai && ai.overallStatus) {
    const status = ai.overallStatus;
    if (status.status === 'verified') {
      return '<span class="compliance-badge passed" title="Ready for Google Rich Results">✓ Google Ready</span>';
    } else if (status.status === 'warnings') {
      return '<span class="compliance-badge warnings" title="Valid with recommendations">⚠ Valid (warnings)</span>';
    } else {
      return '<span class="compliance-badge failed" title="Needs fixes before publishing">✗ Needs Fixes</span>';
    }
  }

  // Fall back to local validation
  if (local) {
    if (local.valid && local.errors.length === 0) {
      return '<span class="compliance-badge passed" title="Schema structure valid">✓ Valid</span>';
    } else if (local.errors.length > 0) {
      return `<span class="compliance-badge failed" title="${local.errors.length} error(s)">✗ ${local.errors.length} Error(s)</span>`;
    } else {
      return '<span class="compliance-badge warnings" title="Has warnings">⚠ Warnings</span>';
    }
  }

  return '';
}

// Get detailed compliance info for modal
function getComplianceDetails(item) {
  if (!item.googleValidation && !item.googleCompliance) {
    return '<p class="compliance-not-checked">Google compliance not checked yet. Generate schema with AI provider selected to verify.</p>';
  }

  let html = '<div class="compliance-details">';

  // Local validation results
  const local = item.googleValidation;
  if (local) {
    html += '<h5>Schema Validation</h5>';
    if (local.errors.length > 0) {
      html += '<div class="compliance-errors"><strong>Errors (must fix):</strong><ul>';
      local.errors.forEach(e => {
        html += `<li><code>${e.field}</code>: ${e.message}</li>`;
      });
      html += '</ul></div>';
    }
    if (local.warnings.length > 0) {
      html += '<div class="compliance-warnings"><strong>Warnings:</strong><ul>';
      local.warnings.forEach(w => {
        html += `<li><code>${w.field}</code>: ${w.message}</li>`;
      });
      html += '</ul></div>';
    }
    if (local.recommendations && local.recommendations.length > 0) {
      html += '<div class="compliance-recommendations"><strong>Recommendations:</strong><ul>';
      local.recommendations.forEach(r => {
        html += `<li><code>${r.field}</code>: ${r.message}</li>`;
      });
      html += '</ul></div>';
    }
    if (local.errors.length === 0 && local.warnings.length === 0) {
      html += '<p class="compliance-ok">✓ No structural issues found</p>';
    }
  }

  // AI verification results
  const ai = item.googleCompliance;
  if (ai && ai.aiVerification) {
    const v = ai.aiVerification;
    html += '<h5>AI Verification</h5>';

    // Rich results eligibility
    if (v.richResultsEligible) {
      html += '<div class="rich-results-status"><strong>Rich Results Eligibility:</strong><ul>';
      for (const [type, eligible] of Object.entries(v.richResultsEligible)) {
        const icon = eligible ? '✓' : '✗';
        const cls = eligible ? 'eligible' : 'not-eligible';
        html += `<li class="${cls}">${icon} ${type}</li>`;
      }
      html += '</ul></div>';
    }

    // Data accuracy
    if (v.dataAccuracy) {
      html += '<div class="data-accuracy"><strong>Data Accuracy:</strong><ul>';
      const da = v.dataAccuracy;
      if (da.businessName) {
        const icon = da.businessName.accurate ? '✓' : '⚠';
        html += `<li>${icon} Business Name: ${da.businessName.accurate ? 'Accurate' : da.businessName.issue || 'May be inaccurate'}</li>`;
      }
      if (da.address) {
        const icon = da.address.accurate ? '✓' : '⚠';
        html += `<li>${icon} Address: ${da.address.accurate ? 'Accurate' : da.address.issue || 'May be incomplete'}${da.address.suggestion ? ` (Suggested: ${da.address.suggestion})` : ''}</li>`;
      }
      if (da.phone) {
        const icon = da.phone.accurate ? '✓' : '⚠';
        html += `<li>${icon} Phone: ${da.phone.accurate ? 'Accurate' : 'Not found on page'}${da.phone.found ? ` (Found: ${da.phone.found})` : ''}</li>`;
      }
      if (da.serviceAreas) {
        const icon = da.serviceAreas.accurate ? '✓' : '⚠';
        html += `<li>${icon} Service Areas: ${da.serviceAreas.accurate ? 'Verified' : 'Some not found on page'}`;
        if (da.serviceAreas.notOnPage && da.serviceAreas.notOnPage.length > 0) {
          html += ` (Not found: ${da.serviceAreas.notOnPage.join(', ')})`;
        }
        html += '</li>';
      }
      html += '</ul></div>';
    }

    // Critical fixes
    if (v.criticalFixes && v.criticalFixes.length > 0) {
      html += '<div class="critical-fixes"><strong>⚠ Critical Fixes Needed:</strong><ul>';
      v.criticalFixes.forEach(f => {
        html += `<li><code>${f.field}</code>: ${f.issue}<br><em>Fix: ${f.fix}</em></li>`;
      });
      html += '</ul></div>';
    }

    // Summary
    if (v.summary) {
      html += `<div class="ai-summary"><strong>AI Summary:</strong> ${v.summary}</div>`;
    }

    // Confidence
    if (v.confidence) {
      const confPercent = Math.round(v.confidence * 100);
      html += `<div class="confidence">Confidence: ${confPercent}%</div>`;
    }
  }

  html += '</div>';
  return html;
}

// Make functions globally available
window.previewSchema = previewSchema;
window.insertSchema = insertSchema;
window.verifyGoogleCompliance = verifyGoogleCompliance;
window.verifyAllGoogleCompliance = verifyAllGoogleCompliance;
window.verifyAllInsertions = verifyAllInsertions;
window.verifySingleInsertion = verifySingleInsertion;

// ==================== Direct Database Functions ====================

// Initialize database UI tabs and event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Connection method tabs
  document.querySelectorAll('.conn-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.conn-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.conn-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const tabId = tab.dataset.connTab + '-tab';
      document.getElementById(tabId)?.classList.add('active');
    });
  });

  // Database connection test
  document.getElementById('test-db-connection')?.addEventListener('click', testDbConnection);

  // Database tools
  document.getElementById('db-find-post')?.addEventListener('click', dbFindPost);
  document.getElementById('db-view-schemas')?.addEventListener('click', dbViewSchemas);
  document.getElementById('db-preview-insert')?.addEventListener('click', dbPreviewInsert);
  document.getElementById('db-execute-insert')?.addEventListener('click', dbExecuteInsert);
  document.getElementById('db-rollback')?.addEventListener('click', dbRollback);

  // Load saved DB credentials
  loadDbCredentials();
});

// Store current post info for database operations
let currentDbPost = null;
let lastInsertedPostId = null;

// Get database credentials from form
function getDbCredentials() {
  return {
    host: document.getElementById('dbHost')?.value || 'localhost',
    port: parseInt(document.getElementById('dbPort')?.value) || 3306,
    user: document.getElementById('dbUser')?.value || '',
    password: document.getElementById('dbPassword')?.value || '',
    database: document.getElementById('dbName')?.value || '',
    tablePrefix: document.getElementById('dbTablePrefix')?.value || 'wp_'
  };
}

// Save DB credentials to localStorage
function saveDbCredentials() {
  const creds = getDbCredentials();
  try {
    // Don't save password for security
    localStorage.setItem('dbCredentials', JSON.stringify({
      host: creds.host,
      port: creds.port,
      user: creds.user,
      database: creds.database,
      tablePrefix: creds.tablePrefix
    }));
  } catch (e) {}
}

// Load saved DB credentials
function loadDbCredentials() {
  try {
    const saved = JSON.parse(localStorage.getItem('dbCredentials') || '{}');
    if (saved.host) document.getElementById('dbHost').value = saved.host;
    if (saved.port) document.getElementById('dbPort').value = saved.port;
    if (saved.user) document.getElementById('dbUser').value = saved.user;
    if (saved.database) document.getElementById('dbName').value = saved.database;
    if (saved.tablePrefix) document.getElementById('dbTablePrefix').value = saved.tablePrefix;
  } catch (e) {}
}

// Test database connection
async function testDbConnection() {
  const statusEl = document.getElementById('db-connection-status');
  const creds = getDbCredentials();

  if (!creds.user || !creds.password || !creds.database) {
    statusEl.textContent = 'Please fill in all database credentials';
    statusEl.className = 'status-error';
    return;
  }

  statusEl.textContent = 'Testing connection...';
  statusEl.className = 'status-pending';

  try {
    const response = await fetch('/api/db/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds)
    });

    const data = await response.json();

    if (data.success) {
      statusEl.textContent = `✓ Connected! Table prefix: ${data.tablePrefix}`;
      statusEl.className = 'status-success';
      document.getElementById('db-tools')?.classList.remove('hidden');
      saveDbCredentials();
    } else {
      throw new Error(data.error || 'Connection failed');
    }
  } catch (error) {
    statusEl.textContent = `✗ ${error.message}`;
    statusEl.className = 'status-error';
  }
}

// Extract slug from URL or use direct input
function getPostSlugOrId() {
  const slugInput = document.getElementById('dbPostSlug')?.value?.trim();
  const postIdInput = document.getElementById('dbPostId')?.value?.trim();

  if (postIdInput) {
    return { type: 'id', value: parseInt(postIdInput) };
  }

  if (slugInput) {
    // Check if it's a URL
    if (slugInput.startsWith('http')) {
      try {
        const url = new URL(slugInput);
        const path = url.pathname.replace(/\/$/, '');
        const slug = path.split('/').pop();
        return { type: 'slug', value: slug };
      } catch {
        return { type: 'slug', value: slugInput };
      }
    }
    return { type: 'slug', value: slugInput };
  }

  return null;
}

// Find post by slug
async function dbFindPost() {
  const postInfo = getPostSlugOrId();
  const infoEl = document.getElementById('db-post-info');

  if (!postInfo) {
    infoEl.innerHTML = '<p>Please enter a post slug, URL, or ID</p>';
    infoEl.className = 'db-post-info error';
    infoEl.classList.remove('hidden');
    return;
  }

  const creds = getDbCredentials();
  infoEl.innerHTML = '<p>Looking up post...</p>';
  infoEl.className = 'db-post-info';
  infoEl.classList.remove('hidden');

  try {
    let postData;

    if (postInfo.type === 'slug') {
      const response = await fetch('/api/db/get-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...creds, slug: postInfo.value })
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      postData = data.post;
    } else {
      // For post ID, we'll use the preview endpoint to get info
      postData = { ID: postInfo.value };
    }

    currentDbPost = postData;

    infoEl.innerHTML = `
      <h5>✓ Post Found</h5>
      <p><strong>ID:</strong> ${postData.ID}</p>
      ${postData.post_title ? `<p><strong>Title:</strong> ${postData.post_title}</p>` : ''}
      ${postData.post_type ? `<p><strong>Type:</strong> ${postData.post_type}</p>` : ''}
      ${postData.post_status ? `<p><strong>Status:</strong> ${postData.post_status}</p>` : ''}
    `;
    infoEl.className = 'db-post-info';

    // Update post ID input
    document.getElementById('dbPostId').value = postData.ID;

    // Show insert section
    document.getElementById('db-insert-section')?.classList.remove('hidden');

  } catch (error) {
    infoEl.innerHTML = `<p>✗ ${error.message}</p>`;
    infoEl.className = 'db-post-info error';
    currentDbPost = null;
  }
}

// View existing schemas for post
async function dbViewSchemas() {
  const postInfo = getPostSlugOrId();
  const listEl = document.getElementById('db-schemas-list');

  if (!postInfo && !currentDbPost) {
    listEl.innerHTML = '<p>Please find a post first</p>';
    listEl.classList.remove('hidden');
    return;
  }

  const postId = currentDbPost?.ID || (postInfo?.type === 'id' ? postInfo.value : null);

  if (!postId) {
    await dbFindPost();
    if (!currentDbPost) return;
  }

  const creds = getDbCredentials();
  listEl.innerHTML = '<p>Loading schemas...</p>';
  listEl.classList.remove('hidden');

  try {
    const response = await fetch('/api/db/get-schemas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...creds, postId: currentDbPost?.ID || postId })
    });

    const data = await response.json();

    if (!data.success) throw new Error(data.error);

    if (data.schemas.length === 0) {
      listEl.innerHTML = '<h5>No RankMath Schemas Found</h5><p>This post has no existing RankMath schema meta entries.</p>';
    } else {
      let html = `<h5>Found ${data.count} RankMath Schema(s)</h5>`;
      data.schemas.forEach(s => {
        const preview = s.value?.substring(0, 200) || '';
        html += `
          <div class="db-schema-entry">
            <div class="meta-key">${s.key}</div>
            <div class="meta-id">Meta ID: ${s.metaId}</div>
            <div class="meta-preview">${preview}${s.value?.length > 200 ? '...' : ''}</div>
          </div>
        `;
      });
      listEl.innerHTML = html;
    }

    // Show insert section
    document.getElementById('db-insert-section')?.classList.remove('hidden');

  } catch (error) {
    listEl.innerHTML = `<p>Error: ${error.message}</p>`;
  }
}

// Preview schema insertion (dry run)
async function dbPreviewInsert() {
  const previewEl = document.getElementById('db-insert-preview');
  const executeBtn = document.getElementById('db-execute-insert');

  const postId = currentDbPost?.ID || document.getElementById('dbPostId')?.value;
  if (!postId) {
    previewEl.innerHTML = '<p>Please find a post first</p>';
    previewEl.className = 'db-preview error';
    previewEl.classList.remove('hidden');
    return;
  }

  const schemaType = document.getElementById('db-schema-type')?.value || 'Custom';
  const schemaJson = document.getElementById('db-schema-json')?.value?.trim();

  if (!schemaJson) {
    previewEl.innerHTML = '<p>Please enter schema JSON</p>';
    previewEl.className = 'db-preview error';
    previewEl.classList.remove('hidden');
    return;
  }

  let schema;
  try {
    schema = JSON.parse(schemaJson);
  } catch (e) {
    previewEl.innerHTML = `<p>Invalid JSON: ${e.message}</p>`;
    previewEl.className = 'db-preview error';
    previewEl.classList.remove('hidden');
    return;
  }

  const creds = getDbCredentials();
  previewEl.innerHTML = '<p>Previewing insertion...</p>';
  previewEl.className = 'db-preview';
  previewEl.classList.remove('hidden');

  try {
    const response = await fetch('/api/db/insert-schema', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...creds,
        postId: parseInt(postId),
        schema,
        schemaType,
        dryRun: true,
        backup: true
      })
    });

    const data = await response.json();

    if (!data.success) throw new Error(data.error);

    previewEl.innerHTML = `
      <h5>🔍 DRY RUN PREVIEW (No Changes Made)</h5>
      <p><strong>Post:</strong> ${data.postTitle || `ID ${postId}`}</p>
      <p><strong>Meta Key:</strong> <code>${data.metaKey}</code></p>
      <p><strong>Action:</strong> ${data.action}</p>
      ${data.existingMetaId ? `<p><strong>Existing Meta ID:</strong> ${data.existingMetaId}</p>` : ''}
      <p><strong>Schema Size:</strong> ${data.metaValueLength} bytes</p>
      <p style="margin-top: 15px; color: #e65100;"><strong>⚠ Click "Execute Insertion" to make actual changes</strong></p>
    `;
    previewEl.className = 'db-preview dry-run';

    // Enable execute button
    executeBtn.disabled = false;
    executeBtn.dataset.postId = postId;
    executeBtn.dataset.schemaType = schemaType;

  } catch (error) {
    previewEl.innerHTML = `<p>Error: ${error.message}</p>`;
    previewEl.className = 'db-preview error';
    executeBtn.disabled = true;
  }
}

// Execute schema insertion
async function dbExecuteInsert() {
  const previewEl = document.getElementById('db-insert-preview');
  const executeBtn = document.getElementById('db-execute-insert');
  const rollbackBtn = document.getElementById('db-rollback');

  const postId = executeBtn.dataset.postId;
  const schemaType = executeBtn.dataset.schemaType || 'Custom';

  if (!postId) {
    alert('Please preview the insertion first');
    return;
  }

  const schemaJson = document.getElementById('db-schema-json')?.value?.trim();
  let schema;
  try {
    schema = JSON.parse(schemaJson);
  } catch (e) {
    alert('Invalid JSON');
    return;
  }

  if (!confirm('Are you sure you want to insert this schema into the database?\n\nThis will modify the wp_postmeta table.')) {
    return;
  }

  const creds = getDbCredentials();
  previewEl.innerHTML = '<p>Inserting schema...</p>';

  try {
    const response = await fetch('/api/db/insert-schema', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...creds,
        postId: parseInt(postId),
        schema,
        schemaType,
        dryRun: false,
        backup: true
      })
    });

    const data = await response.json();

    if (!data.success) throw new Error(data.error);

    previewEl.innerHTML = `
      <h5>✓ Schema Inserted Successfully</h5>
      <p><strong>Action:</strong> ${data.action}</p>
      <p><strong>Meta ID:</strong> ${data.metaId}</p>
      <p><strong>Meta Key:</strong> <code>${data.metaKey}</code></p>
      ${data.canRollback ? '<p style="color: #2e7d32;">✓ Backup saved - you can rollback if needed</p>' : ''}
    `;
    previewEl.className = 'db-preview success';

    // Store for rollback
    lastInsertedPostId = postId;

    // Show rollback button
    if (data.canRollback) {
      rollbackBtn.classList.remove('hidden');
      rollbackBtn.dataset.postId = postId;
    }

    // Disable execute button until next preview
    executeBtn.disabled = true;

    // Refresh schemas list
    await dbViewSchemas();

  } catch (error) {
    previewEl.innerHTML = `<p>Error: ${error.message}</p>`;
    previewEl.className = 'db-preview error';
  }
}

// Rollback last insertion
async function dbRollback() {
  const rollbackBtn = document.getElementById('db-rollback');
  const previewEl = document.getElementById('db-insert-preview');

  const postId = rollbackBtn.dataset.postId || lastInsertedPostId;

  if (!postId) {
    alert('No insertion to rollback');
    return;
  }

  if (!confirm('Are you sure you want to rollback the last insertion?\n\nThis will restore the previous schema state.')) {
    return;
  }

  const creds = getDbCredentials();
  previewEl.innerHTML = '<p>Rolling back...</p>';

  try {
    const response = await fetch('/api/db/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...creds, postId: parseInt(postId) })
    });

    const data = await response.json();

    if (!data.success) throw new Error(data.error);

    previewEl.innerHTML = `
      <h5>✓ Rollback Successful</h5>
      <p><strong>Restored:</strong> ${data.restored} schema entries</p>
      <p><strong>Backup from:</strong> ${data.backupTimestamp}</p>
    `;
    previewEl.className = 'db-preview success';

    // Hide rollback button
    rollbackBtn.classList.add('hidden');
    lastInsertedPostId = null;

    // Refresh schemas list
    await dbViewSchemas();

  } catch (error) {
    previewEl.innerHTML = `<p>Rollback failed: ${error.message}</p>`;
    previewEl.className = 'db-preview error';
  }
}

// Export database functions
window.testDbConnection = testDbConnection;
window.dbFindPost = dbFindPost;
window.dbViewSchemas = dbViewSchemas;
window.dbPreviewInsert = dbPreviewInsert;
window.dbExecuteInsert = dbExecuteInsert;
window.dbRollback = dbRollback;

// ============================================================================
// RankMath Helper Functions
// ============================================================================

// Store for current page data
let rmCurrentPageInfo = null;
let rmCurrentSchema = null;

// Get RankMath credentials
function getRankMathCredentials() {
  return {
    siteUrl: document.getElementById('rmSiteUrl')?.value || '',
    secretToken: document.getElementById('rmSecretToken')?.value || ''
  };
}

// Save RankMath credentials to localStorage
function saveRankMathCredentials() {
  const creds = getRankMathCredentials();
  localStorage.setItem('rmSiteUrl', creds.siteUrl);
  localStorage.setItem('rmSecretToken', creds.secretToken);
}

// Load saved RankMath credentials
function loadRankMathCredentials() {
  const siteUrl = localStorage.getItem('rmSiteUrl');
  const secretToken = localStorage.getItem('rmSecretToken');

  if (siteUrl) {
    const input = document.getElementById('rmSiteUrl');
    if (input) input.value = siteUrl;
  }
  if (secretToken) {
    const input = document.getElementById('rmSecretToken');
    if (input) input.value = secretToken;
  }
}

// Test RankMath helper connection
async function testRankMathConnection() {
  const statusEl = document.getElementById('rankmath-connection-status');
  const actionsCard = document.getElementById('schema-actions-card');
  const creds = getRankMathCredentials();

  if (!creds.siteUrl || !creds.secretToken) {
    statusEl.innerHTML = '<span class="error">Please enter site URL and secret token</span>';
    return;
  }

  statusEl.innerHTML = '<span class="loading">Connecting...</span>';

  try {
    const response = await fetch('/api/rankmath/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds)
    });

    const result = await response.json();

    if (result.success) {
      statusEl.innerHTML = '<span class="success">✓ Connected</span>';
      if (actionsCard) actionsCard.style.display = 'block';
      saveRankMathCredentials();

      // Pre-fill the page URL input with the site URL
      const pageUrlInput = document.getElementById('rmPageUrl');
      if (pageUrlInput && !pageUrlInput.value) {
        pageUrlInput.placeholder = creds.siteUrl + '/your-page-slug/';
      }
    } else {
      statusEl.innerHTML = '<span class="error">✗ ' + (result.error || 'Connection failed') + '</span>';
      if (actionsCard) actionsCard.style.display = 'none';
    }
  } catch (error) {
    statusEl.innerHTML = '<span class="error">✗ ' + error.message + '</span>';
    if (actionsCard) actionsCard.style.display = 'none';
  }
}

// Get page info
async function rmGetPageInfo() {
  const pageInfoEl = document.getElementById('rm-page-info');
  const schemaSectionEl = document.getElementById('rm-schema-section');
  const creds = getRankMathCredentials();
  const pageUrl = document.getElementById('rmPageUrl')?.value;

  if (!pageUrl) {
    pageInfoEl.innerHTML = '<p class="error">Please enter a page URL</p>';
    pageInfoEl.classList.remove('hidden');
    return;
  }

  pageInfoEl.innerHTML = '<p class="loading">Getting page info...</p>';
  pageInfoEl.classList.remove('hidden');

  try {
    const response = await fetch('/api/rankmath/page-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...creds, pageUrl })
    });

    const result = await response.json();

    if (result.success) {
      rmCurrentPageInfo = result;

      let html = `
        <div class="success-box">
          <p><strong>Post Found:</strong> ${result.post_title}</p>
          <p><strong>Post ID:</strong> ${result.post_id} | <strong>Type:</strong> ${result.post_type} | <strong>Slug:</strong> ${result.post_slug}</p>
        </div>
      `;

      if (result.existingSchemas && result.existingSchemas.length > 0) {
        html += '<h5>Existing Schemas:</h5><ul>';
        result.existingSchemas.forEach(s => {
          html += `<li><strong>${s.schema_type}</strong> (${s.meta_key})</li>`;
        });
        html += '</ul>';
      } else {
        html += '<p><em>No existing RankMath schemas found.</em></p>';
      }

      pageInfoEl.innerHTML = html;
      schemaSectionEl.classList.remove('hidden');
    } else {
      pageInfoEl.innerHTML = `<p class="error">${result.error || 'Post not found'}</p>`;
      schemaSectionEl.classList.add('hidden');
    }
  } catch (error) {
    pageInfoEl.innerHTML = `<p class="error">${error.message}</p>`;
    schemaSectionEl.classList.add('hidden');
  }
}

// Generate schema for page
async function rmGenerateSchema() {
  const pageInfoEl = document.getElementById('rm-page-info');
  const schemaSectionEl = document.getElementById('rm-schema-section');
  const schemaPreviewEl = document.getElementById('rm-schema-preview');
  const creds = getRankMathCredentials();
  const pageUrl = document.getElementById('rmPageUrl')?.value;

  if (!pageUrl) {
    pageInfoEl.innerHTML = '<p class="error">Please enter a page URL</p>';
    pageInfoEl.classList.remove('hidden');
    return;
  }

  pageInfoEl.innerHTML = '<p class="loading">Generating schema... (scraping page, detecting type, building schema)</p>';
  pageInfoEl.classList.remove('hidden');

  try {
    // Get organization info
    const orgInfo = getOrgInfo();

    // Call schema generation API (pass RankMath creds for server-side fetch)
    const response = await fetch('/api/generate-schema', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: pageUrl, orgInfo, ...creds })
    });

    const result = await response.json();

    if (result.schema) {
      rmCurrentSchema = result.schema;

      // Also get page info
      const pageResponse = await fetch('/api/rankmath/page-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...creds, pageUrl })
      });
      const pageResult = await pageResponse.json();

      if (pageResult.success) {
        rmCurrentPageInfo = pageResult;

        let html = `
          <div class="success-box">
            <p><strong>Post:</strong> ${pageResult.post_title} (ID: ${pageResult.post_id})</p>
            <p><strong>Page Type Detected:</strong> ${result.pageType}</p>
          </div>
        `;

        if (pageResult.existingSchemas && pageResult.existingSchemas.length > 0) {
          html += '<p><strong>Warning:</strong> This page has existing schemas that will be updated.</p>';
        }

        pageInfoEl.innerHTML = html;
      }

      // Show schema preview
      schemaPreviewEl.value = JSON.stringify(rmCurrentSchema, null, 2);
      schemaSectionEl.classList.remove('hidden');

    } else {
      pageInfoEl.innerHTML = `<p class="error">${result.error || 'Failed to generate schema'}</p>`;
      schemaSectionEl.classList.add('hidden');
    }
  } catch (error) {
    pageInfoEl.innerHTML = `<p class="error">${error.message}</p>`;
    schemaSectionEl.classList.add('hidden');
  }
}

// Insert schema into RankMath
async function rmInsertSchema() {
  const resultEl = document.getElementById('rm-insert-result');
  const schemaPreviewEl = document.getElementById('rm-schema-preview');
  const creds = getRankMathCredentials();
  const pageUrl = document.getElementById('rmPageUrl')?.value;

  if (!rmCurrentPageInfo) {
    resultEl.innerHTML = '<p class="error">Please get page info first</p>';
    resultEl.classList.remove('hidden');
    return;
  }

  // Get schema from textarea (user may have edited it)
  let schema;
  try {
    schema = JSON.parse(schemaPreviewEl.value);
  } catch (e) {
    resultEl.innerHTML = '<p class="error">Invalid JSON in schema preview</p>';
    resultEl.classList.remove('hidden');
    return;
  }

  resultEl.innerHTML = '<p class="loading">Inserting schema into RankMath...</p>';
  resultEl.classList.remove('hidden');

  try {
    // Use generate-and-insert if schema has @graph, otherwise insert single
    let response;

    if (schema['@graph']) {
      // Split @graph into individual schemas
      const schemas = [];
      for (const item of schema['@graph']) {
        const type = item['@type'];
        const schemaType = Array.isArray(type) ? type[0] : type;

        // Skip certain types
        if (['WebSite', 'Organization', 'Place', 'ImageObject'].includes(schemaType)) {
          if (Object.keys(item).length <= 3) continue;
        }

        schemas.push({ schema: item, type: schemaType });
      }

      response = await fetch('/api/rankmath/insert-multiple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...creds,
          postId: rmCurrentPageInfo.post_id,
          schemas
        })
      });
    } else {
      const type = schema['@type'];
      const schemaType = Array.isArray(type) ? type[0] : type;

      response = await fetch('/api/rankmath/insert-schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...creds,
          postId: rmCurrentPageInfo.post_id,
          schema,
          schemaType,
          isPrimary: true
        })
      });
    }

    const result = await response.json();

    if (result.success) {
      let html = '<div class="success-box"><p><strong>✓ Schema inserted successfully!</strong></p>';

      if (result.results) {
        html += '<ul>';
        result.results.forEach(r => {
          html += `<li>${r.schema_type}: ${r.updated ? 'Updated' : 'Inserted'}</li>`;
        });
        html += '</ul>';
      } else {
        html += `<p>Schema type: ${result.schema_type}</p>`;
      }

      html += '<p>Check the page in WordPress Admin → Edit Page → RankMath Schema tab</p></div>';
      resultEl.innerHTML = html;
    } else {
      resultEl.innerHTML = `<div class="error-box"><p>${result.error || 'Insert failed'}</p></div>`;
    }
  } catch (error) {
    resultEl.innerHTML = `<div class="error-box"><p>${error.message}</p></div>`;
  }
}

// Delete existing schemas
async function rmDeleteSchemas() {
  const resultEl = document.getElementById('rm-insert-result');
  const creds = getRankMathCredentials();

  if (!rmCurrentPageInfo) {
    resultEl.innerHTML = '<p class="error">Please get page info first</p>';
    resultEl.classList.remove('hidden');
    return;
  }

  if (!confirm('Are you sure you want to delete all RankMath schemas from this page?')) {
    return;
  }

  resultEl.innerHTML = '<p class="loading">Deleting schemas...</p>';
  resultEl.classList.remove('hidden');

  try {
    const response = await fetch('/api/rankmath/delete-schemas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...creds,
        postId: rmCurrentPageInfo.post_id
      })
    });

    const result = await response.json();

    if (result.success) {
      resultEl.innerHTML = `<div class="success-box"><p>✓ Deleted ${result.deleted_count || 'all'} schema(s)</p></div>`;

      // Refresh page info
      await rmGetPageInfo();
    } else {
      resultEl.innerHTML = `<div class="error-box"><p>${result.error || 'Delete failed'}</p></div>`;
    }
  } catch (error) {
    resultEl.innerHTML = `<div class="error-box"><p>${error.message}</p></div>`;
  }
}

// Export RankMath helper functions
window.testRankMathConnection = testRankMathConnection;
window.rmGetPageInfo = rmGetPageInfo;
window.rmGenerateSchema = rmGenerateSchema;
window.rmInsertSchema = rmInsertSchema;
window.rmDeleteSchemas = rmDeleteSchemas;

// ============ ACTIVITY LOG FUNCTIONS ============
// ============ ACTIVITY LOG FUNCTIONS ============

async function loadActivityLogs() {
  const logContainer = document.getElementById('activity-log');
  const filter = document.getElementById('log-filter')?.value || '';

  if (!logContainer) return;

  try {
    const url = filter ? `/api/logs?filter=${filter}&limit=50` : '/api/logs?limit=50';
    const response = await fetch(url);
    const data = await response.json();

    if (data.success && data.logs.length > 0) {
      logContainer.innerHTML = data.logs.map(log => {
        const time = new Date(log.timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });

        let actionClass = '';
        let actionLabel = log.action;

        if (log.action.includes('generated')) {
          actionClass = 'generated';
          actionLabel = 'Generated';
        } else if (log.action.includes('inserted')) {
          actionClass = 'inserted';
          actionLabel = 'Inserted';
        } else if (log.action.includes('verification')) {
          actionClass = 'verified';
          actionLabel = 'AI Verified';
        } else if (log.action.includes('error')) {
          actionClass = 'error';
          actionLabel = 'Error';
        } else if (log.action.includes('token')) {
          actionClass = 'tokens';
          actionLabel = 'Tokens';
        }

        const details = log.url || log.pageUrl || log.error || '';
        const tokens = log.tokens ? `<span class="log-tokens">${log.tokens} tokens</span>` : '';

        return `
          <div class="log-entry">
            <span class="log-time">${time}</span>
            <span class="log-action ${actionClass}">${actionLabel}</span>
            <span class="log-details" title="${details}">${truncateUrl(details)}</span>
            ${tokens}
          </div>
        `;
      }).join('');
    } else {
      logContainer.innerHTML = '<p class="log-empty">No activity yet</p>';
    }

    // Also load stats
    loadLogStats();
  } catch (error) {
    logContainer.innerHTML = `<p class="log-empty">Failed to load logs: ${error.message}</p>`;
  }
}

async function loadLogStats() {
  try {
    const response = await fetch('/api/logs/stats');
    const data = await response.json();

    if (data.success) {
      const todayEl = document.getElementById('stat-today');
      const tokensEl = document.getElementById('stat-tokens');

      if (todayEl) todayEl.textContent = data.stats.today?.count || 0;
      if (tokensEl) tokensEl.textContent = data.stats.tokens?.combined || 0;
    }
  } catch (error) {
    console.log('Failed to load stats:', error);
  }
}

async function clearActivityLogs() {
  if (!confirm('Clear all activity logs?')) return;

  try {
    await fetch('/api/logs', { method: 'DELETE' });
    loadActivityLogs();
  } catch (error) {
    alert('Failed to clear logs: ' + error.message);
  }
}

// Helper function if not already defined
function truncateUrl(url) {
  if (!url) return '';
  if (url.length <= 50) return url;
  return url.substring(0, 47) + '...';
}

// ==================== THEME TOGGLE ====================

function initThemeToggle() {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;

  // Load saved theme preference
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeToggleButton(savedTheme);

  toggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeToggleButton(newTheme);
  });
}

function updateThemeToggleButton(theme) {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;

  const icon = toggle.querySelector('.icon');
  const label = toggle.querySelector('.label');

  if (theme === 'dark') {
    icon.textContent = '☀️';
    label.textContent = 'Light';
  } else {
    icon.textContent = '🌙';
    label.textContent = 'Dark';
  }
}

// ==================== BACK TO TOP ====================

function initBackToTop() {
  const backToTopBtn = document.getElementById('back-to-top');
  if (!backToTopBtn) return;

  // Show/hide button based on scroll position
  window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
      backToTopBtn.classList.add('visible');
    } else {
      backToTopBtn.classList.remove('visible');
    }
  });

  // Scroll to top when clicked
  backToTopBtn.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });
}

// ==================== SCHEMA DIFF ====================

async function showSchemaDiff(index) {
  const item = generatedSchemas[index];
  if (!item || !item.schema) return;

  const creds = getRankMathCredentials();
  if (!creds.siteUrl || !creds.secretToken) {
    alert('Please connect to your site first to compare schemas.');
    return;
  }

  const diffModal = document.getElementById('schema-diff-modal');
  const diffUrl = document.getElementById('diff-url');
  const diffSummary = document.getElementById('diff-summary');
  const diffContent = document.getElementById('diff-content');

  diffUrl.textContent = item.url;
  diffSummary.innerHTML = '<p>Loading diff...</p>';
  diffContent.innerHTML = '';
  diffModal.classList.remove('hidden');

  try {
    const response = await fetch('/api/rankmath/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...creds,
        pageUrl: item.url,
        newSchemas: item.schema
      })
    });

    const data = await response.json();

    if (!data.success) {
      diffSummary.innerHTML = `<p class="error">Error: ${data.error}</p>`;
      return;
    }

    renderDiff(data, diffSummary, diffContent);
  } catch (error) {
    diffSummary.innerHTML = `<p class="error">Error: ${error.message}</p>`;
  }
}

function renderDiff(data, summaryEl, contentEl) {
  const s = data.summary;

  summaryEl.innerHTML = `
    <div class="diff-summary-grid">
      <span class="diff-badge diff-badge-new">${s.newSchemas} new</span>
      <span class="diff-badge diff-badge-removed">${s.removedSchemas} removed</span>
      <span class="diff-badge diff-badge-changed">${s.modifiedSchemas} modified</span>
      <span class="diff-badge diff-badge-unchanged">${s.unchangedSchemas} unchanged</span>
    </div>
  `;

  if (!data.diffs || data.diffs.length === 0) {
    contentEl.innerHTML = '<p>No schemas to compare.</p>';
    return;
  }

  let html = '';
  for (const d of data.diffs) {
    const statusClass = d.status === 'new' ? 'diff-schema-new'
      : d.status === 'removed' ? 'diff-schema-removed'
      : d.status === 'modified' ? 'diff-schema-modified'
      : 'diff-schema-unchanged';

    const statusLabel = d.status === 'new' ? 'NEW'
      : d.status === 'removed' ? 'REMOVED'
      : d.status === 'modified' ? 'MODIFIED'
      : 'UNCHANGED';

    html += `<div class="diff-schema ${statusClass}">`;
    html += `<h4>${d.type} <span class="diff-status-label">${statusLabel}</span></h4>`;

    if (d.diff) {
      if (d.diff.added.length > 0) {
        html += '<div class="diff-section"><h5>Added Fields</h5>';
        for (const f of d.diff.added) {
          const val = typeof f.value === 'object' ? JSON.stringify(f.value, null, 2) : String(f.value);
          html += `<div class="diff-field diff-field-added"><code>${f.path}</code>: <span>${escapeHtml(val.substring(0, 200))}</span></div>`;
        }
        html += '</div>';
      }
      if (d.diff.removed.length > 0) {
        html += '<div class="diff-section"><h5>Removed Fields</h5>';
        for (const f of d.diff.removed) {
          const val = typeof f.value === 'object' ? JSON.stringify(f.value, null, 2) : String(f.value);
          html += `<div class="diff-field diff-field-removed"><code>${f.path}</code>: <span>${escapeHtml(val.substring(0, 200))}</span></div>`;
        }
        html += '</div>';
      }
      if (d.diff.changed.length > 0) {
        html += '<div class="diff-section"><h5>Changed Fields</h5>';
        for (const f of d.diff.changed) {
          const oldVal = typeof f.oldValue === 'object' ? JSON.stringify(f.oldValue, null, 2) : String(f.oldValue);
          const newVal = typeof f.newValue === 'object' ? JSON.stringify(f.newValue, null, 2) : String(f.newValue);
          html += `<div class="diff-field diff-field-changed">
            <code>${f.path}</code><br>
            <span class="diff-old">${escapeHtml(oldVal.substring(0, 150))}</span>
            <span class="diff-arrow">&rarr;</span>
            <span class="diff-new">${escapeHtml(newVal.substring(0, 150))}</span>
          </div>`;
        }
        html += '</div>';
      }
    }

    html += '</div>';
  }

  contentEl.innerHTML = html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.showSchemaDiff = showSchemaDiff;

// ==================== DOWNLOAD ALL SCHEMAS ====================

async function downloadAllSchemas() {
  if (!generatedSchemas || generatedSchemas.length === 0) {
    alert('No schemas to download. Generate some schemas first.');
    return;
  }

  const validSchemas = generatedSchemas.filter(s => s.schema && !s.error);
  if (validSchemas.length === 0) {
    alert('No valid schemas to download.');
    return;
  }

  // Ask user for download format
  const format = prompt(
    'Download format:\n' +
    '1 = Single JSON file (all schemas in one file)\n' +
    '2 = ZIP file (each schema as separate JSON file)\n\n' +
    'Enter 1 or 2:',
    '1'
  );

  if (format === '1') {
    downloadAsSingleJson(validSchemas);
  } else if (format === '2') {
    downloadAsZip(validSchemas);
  }
}

function downloadAsSingleJson(schemas) {
  const allSchemas = schemas.map(item => ({
    url: item.url,
    pageType: item.pageType,
    schema: item.schema
  }));

  const blob = new Blob([JSON.stringify(allSchemas, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `schemas-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function downloadAsZip(schemas) {
  // Simple ZIP implementation using JSZip-like approach
  // We'll create a basic ZIP file structure manually

  try {
    // Check if JSZip is available, if not use fallback
    if (typeof JSZip !== 'undefined') {
      const zip = new JSZip();

      schemas.forEach((item, index) => {
        const filename = sanitizeFilename(item.url) + '.json';
        zip.file(filename, JSON.stringify(item.schema, null, 2));
      });

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `schemas-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      // Fallback: download as single JSON with individual schema structure
      alert('ZIP library not loaded. Downloading as single JSON file instead.');
      downloadAsSingleJson(schemas);
    }
  } catch (error) {
    console.error('ZIP creation failed:', error);
    alert('Failed to create ZIP. Downloading as single JSON file instead.');
    downloadAsSingleJson(schemas);
  }
}

function sanitizeFilename(url) {
  try {
    const urlObj = new URL(url);
    let filename = urlObj.pathname.replace(/\//g, '-').replace(/^-/, '').replace(/-$/, '');
    if (!filename) filename = urlObj.hostname;
    // Remove special characters
    filename = filename.replace(/[^a-zA-Z0-9-_]/g, '');
    // Limit length
    if (filename.length > 50) filename = filename.substring(0, 50);
    return filename || 'schema';
  } catch {
    return 'schema-' + Date.now();
  }
}

// Load JSZip library dynamically if needed for ZIP downloads
function loadJSZip() {
  return new Promise((resolve, reject) => {
    if (typeof JSZip !== 'undefined') {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Preload JSZip when page loads (optional, improves UX)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    loadJSZip().catch(() => console.log('JSZip not loaded - ZIP downloads will fallback to JSON'));
  });
} else {
  loadJSZip().catch(() => console.log('JSZip not loaded - ZIP downloads will fallback to JSON'));
}
