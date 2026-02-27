/**
 * BreadcrumbList schema template
 * Helps Google understand page hierarchy
 */

/**
 * Generate a BreadcrumbList schema from breadcrumb data
 * @param {array} breadcrumbs - Array of {name, url} objects in order
 * @returns {object|null} - JSON-LD BreadcrumbList schema or null if insufficient data
 */
function generate(breadcrumbs) {
  if (!breadcrumbs || breadcrumbs.length < 2) {
    return null;
  }

  return {
    '@type': 'BreadcrumbList',
    'itemListElement': breadcrumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      'position': index + 1,
      'name': crumb.name,
      'item': crumb.url
    }))
  };
}

/**
 * Generate breadcrumbs from URL path
 * @param {string} url - Page URL
 * @param {string} siteName - Site name for home
 * @returns {array} - Array of breadcrumb objects
 */
function generateFromUrl(url, siteName = 'Home') {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(p => p);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

    const breadcrumbs = [
      { name: siteName, url: baseUrl }
    ];

    let currentPath = baseUrl;
    for (const part of pathParts) {
      currentPath += '/' + part;
      const name = part
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
      breadcrumbs.push({ name, url: currentPath });
    }

    return breadcrumbs;
  } catch {
    return [];
  }
}

module.exports = {
  generate,
  generateFromUrl
};
