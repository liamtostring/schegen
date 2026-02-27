/**
 * FAQPage schema template
 * Following Google's structured data guidelines for FAQ rich results
 */

/**
 * Generate a FAQPage schema from detected Q&A pairs
 * @param {array} faqs - Array of {question, answer} objects
 * @returns {object|null} - JSON-LD FAQPage schema or null if no FAQs
 */
function generate(faqs) {
  if (!faqs || faqs.length === 0) {
    return null;
  }

  // Filter out invalid FAQs and limit to reasonable number
  const validFaqs = faqs
    .filter(faq => faq.question && faq.answer && faq.question.trim() && faq.answer.trim())
    .slice(0, 10); // Google recommends not exceeding 10 FAQs

  if (validFaqs.length === 0) {
    return null;
  }

  return {
    '@type': 'FAQPage',
    'mainEntity': validFaqs.map(faq => ({
      '@type': 'Question',
      'name': cleanText(faq.question),
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': cleanText(faq.answer)
      }
    }))
  };
}

/**
 * Clean text for schema output
 */
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

module.exports = {
  generate
};
