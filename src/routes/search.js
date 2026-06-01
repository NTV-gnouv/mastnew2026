const express = require('express');
const router = express.Router();
const { searchTax } = require('../scrapers/taxScraper');

function isLikelyTaxCode(query) {
  return /^\d{10,13}(?:-\d{3})?$/.test(String(query || '').trim());
}

async function handleSearch(req, res) {
  try {
    const { query, type = 'auto', page = 1, city = '' } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required and must be a string'
      });
    }

    // Validate search type
    const validTypes = ['auto', 'enterpriseTax', 'personalTax', 'identity', 'enterpriseName', 'legalName'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid type. Valid types are: ${validTypes.join(', ')}`
      });
    }

    // Sanitize query
    const sanitizedQuery = query.trim().substring(0, 255);
    if (!sanitizedQuery) {
      return res.status(400).json({
        success: false,
        error: 'Query cannot be empty'
      });
    }

    const normalizedPage = Number(page);
    if (!Number.isInteger(normalizedPage) || normalizedPage < 1) {
      return res.status(400).json({
        success: false,
        error: 'Page must be a positive integer (>= 1)'
      });
    }

    const normalizedCity = String(city || '').trim();

    console.log(`Searching for "${sanitizedQuery}" with type "${type}", page=${normalizedPage}, city="${normalizedCity}"`);
    const debug = !!req.body.debug;
    const raw = await searchTax(sanitizedQuery, type, {
      debug,
      page: normalizedPage,
      city: normalizedCity
    });

    // searchTax may return an object { results, filters, pages }
    const results = Array.isArray(raw) ? raw : (raw.results || []);
    const meta = (raw && !Array.isArray(raw))
      ? {
        filters: raw.filters || [],
        pages: raw.pages || [],
        cities: raw.cities || [],
        currentPage: raw.currentPage || normalizedPage,
        currentCity: raw.currentCity !== undefined ? raw.currentCity : normalizedCity,
        rawHtml: raw.rawHtml || null
      }
      : {
        filters: [],
        pages: [],
        cities: [],
        currentPage: normalizedPage,
        currentCity: normalizedCity,
        rawHtml: null
      };

    if (isLikelyTaxCode(sanitizedQuery) && results.length === 0) {
      return res.status(404).json({
        success: false,
        query: sanitizedQuery,
        type,
        error: 'Không tìm thấy dữ liệu khớp tuyệt đối với mã số thuế này',
        results: [],
        meta
      });
    }

    res.json({
      success: true,
      query: sanitizedQuery,
      type,
      results,
      meta
    });
  } catch (error) {
    console.error('Search error:', error);

    const message = String(error?.message || '');
    if (/cloudflare|chống bot|rate limit|giới hạn tần suất/i.test(message)) {
      return res.status(503).json({
        success: false,
        error: message,
        retryAfterSeconds: 60
      });
    }

    if (/timeout/i.test(message)) {
      return res.status(504).json({
        success: false,
        error: message
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Search failed'
    });
  }
}

/**
 * POST /api/search/tax
 * Body: {
 *   "query": "search_keyword",
 *   "type": "auto|enterpriseTax|personalTax|identity|enterpriseName|legalName",
 *   "page": 1,
 *   "city": "245"
 * }
 */
router.post('/tax', handleSearch);

/**
 * POST /api/search/tax/page
 * Alias endpoint for paginated list requests
 * Body: {
 *   "query": "search_keyword",
 *   "type": "auto|enterpriseTax|personalTax|identity|enterpriseName|legalName",
 *   "page": 2,
 *   "city": "245"
 * }
 */
router.post('/tax/page', async (req, res) => {
  const nextReq = {
    ...req.body,
    page: req.body.page || 1,
    city: req.body.city || ''
  };
  req.body = nextReq;
  return handleSearch(req, res);
});

module.exports = router;
