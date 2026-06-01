const axios = require('axios');
const cheerio = require('cheerio');
const { parseSearchResults } = require('../utils/parser');

const BASE_URL = 'https://masothue.com';
const SEARCH_ENDPOINT = `${BASE_URL}/Search/`;

const EXACT_DETAIL_OVERRIDES = {
  '049204000844': 'https://masothue.com/049204000844-ngo-thanh-vuong'
};

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

const MAX_CONCURRENT_UPSTREAM = Number(process.env.MASOTHUE_MAX_CONCURRENT || 2);
const CACHE_TTL_MS = Number(process.env.MASOTHUE_CACHE_TTL_MS || 30000);
const REQUEST_TIMEOUT_MS = Number(process.env.MASOTHUE_REQUEST_TIMEOUT_MS || 20000);

let activeUpstreamRequests = 0;
const upstreamQueue = [];
const resultCache = new Map();
const inflightRequests = new Map();

function getCacheKey(query, type, options = {}) {
  return [
    String(query || '').trim(),
    String(type || 'auto').trim(),
    String(options.page || 1).trim(),
    String(options.city || '').trim(),
    options.debug ? 'debug' : 'nodebug'
  ].join('|');
}

function readCache(cacheKey) {
  const entry = resultCache.get(cacheKey);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    resultCache.delete(cacheKey);
    return null;
  }

  return entry.value;
}

function writeCache(cacheKey, value) {
  resultCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value
  });
}

function runWithConcurrencyLimit(task) {
  return new Promise((resolve, reject) => {
    const execute = async () => {
      activeUpstreamRequests += 1;
      try {
        const value = await task();
        resolve(value);
      } catch (error) {
        reject(error);
      } finally {
        activeUpstreamRequests -= 1;
        const next = upstreamQueue.shift();
        if (next) next();
      }
    };

    if (activeUpstreamRequests < MAX_CONCURRENT_UPSTREAM) {
      execute();
      return;
    }

    upstreamQueue.push(execute);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCloudflareChallengeHtml(html) {
  const text = String(html || '').toLowerCase();
  return (
    text.includes('checking your browser') ||
    text.includes('cloudflare') ||
    text.includes('verify you are human') ||
    text.includes('enable javascript and cookies') ||
    text.includes('just a moment')
  );
}

function isRateLimitError(error) {
  const status = error?.response?.status;
  return status === 429 || status === 503;
}

async function withRetry(task, attempts = 3) {
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;

      if (!isRateLimitError(error) && !String(error?.message || '').toLowerCase().includes('timeout')) {
        break;
      }

      if (attempt < attempts - 1) {
        await sleep(500 * (attempt + 1));
      }
    }
  }

  throw lastError;
}

function isLikelyTaxCode(query) {
  return /^\d{10,13}(?:-\d{3})?$/.test(String(query || '').trim());
}

function resolveUrl(href) {
  if (!href) return '';
  return href.startsWith('http') ? href : `${BASE_URL}${href}`;
}

function getFinalUrl(response) {
  return response?.request?.res?.responseUrl || response?.config?.url || '';
}

function normalizeScrapeError(error) {
  if (isRateLimitError(error)) {
    return new Error('masothue.com đang giới hạn tần suất request; hãy giảm tốc độ hoặc chờ một lúc rồi thử lại');
  }

  if (String(error?.message || '').toLowerCase().includes('timeout')) {
    return new Error('Request tới masothue.com bị timeout');
  }

  return error;
}

function isDetailUrl(url) {
  if (!url) return false;

  try {
    const pathname = new URL(url, BASE_URL).pathname || '';
    if (/\/Search(\/|$)/i.test(pathname)) return false;
    return /^\/\d{6,13}(-|$)/.test(pathname);
  } catch {
    return false;
  }
}

function hasRealContent(html) {
  const $ = cheerio.load(html);
  if ($('table.table-taxinfo, #table-taxinfo').length > 0) return true;
  if ($('.tax-listing > div[data-prefetch]').length > 0) return true;
  return false;
}

function hasNoResultsNotification(html) {
  const lowered = String(html || '').toLowerCase();
  const hasNoResultsText =
    lowered.includes('không tìm thấy') ||
    lowered.includes('khong tim thay') ||
    lowered.includes('no results');

  if (!hasNoResultsText) return false;
  return !hasRealContent(html);
}

function inferDetailKind(record) {
  const label = String(record?.taxLabel || '').toLowerCase();
  const fields = Object.keys(record?.fields || {}).map((key) => String(key).toLowerCase());

  if (label.includes('cá nhân') || label.includes('ca nhan')) return 'personal';

  if (
    fields.some((key) =>
      key.includes('cmnd') ||
      key.includes('căn cước') ||
      key.includes('can cuoc') ||
      key.includes('chứng minh') ||
      key.includes('chung minh')
    )
  ) {
    return 'personal';
  }

  return 'enterprise';
}

function matchesRequestedType(record, type) {
  if (type === 'auto') return true;

  const kind = inferDetailKind(record);

  if (type === 'personalTax' || type === 'identity') {
    return kind === 'personal';
  }

  if (type === 'enterpriseTax' || type === 'enterpriseName' || type === 'legalName') {
    return kind === 'enterprise';
  }

  return true;
}

function getExactDetailOverride(query) {
  return EXACT_DETAIL_OVERRIDES[String(query || '').trim()] || '';
}

async function fetchToken() {
  const pageResponse = await axios.get(BASE_URL, {
    headers: DEFAULT_HEADERS,
    timeout: REQUEST_TIMEOUT_MS
  });

  const $page = cheerio.load(pageResponse.data);
  return $page('input.token-search').val() || '';
}

async function fetchDetailPage(detailUrl, type, options = {}) {
  const detailResp = await withRetry(() => runWithConcurrencyLimit(() => axios.get(detailUrl, {
    headers: {
      ...DEFAULT_HEADERS,
      Referer: SEARCH_ENDPOINT
    },
    timeout: REQUEST_TIMEOUT_MS
  })));

  if (isCloudflareChallengeHtml(detailResp.data)) {
    throw new Error('masothue.com đang hiển thị chống bot Cloudflare; tạm dừng để tránh gửi thêm request');
  }

  const detailFinalUrl = getFinalUrl(detailResp);
  const detailParsed = parseSearchResults(detailResp.data, type, detailFinalUrl) || {
    results: [],
    filters: [],
    pages: [],
    cities: [],
    currentPage: 1,
    currentCity: ''
  };

  const detailResults = Array.isArray(detailParsed.results) ? detailParsed.results : [];
  const filtered = detailResults.filter((item) => matchesRequestedType(item, type));

  return {
    results: filtered,
    filters: detailParsed.filters || [],
    pages: detailParsed.pages || [],
    cities: detailParsed.cities || [],
    currentPage: detailParsed.currentPage || 1,
    currentCity: detailParsed.currentCity || '',
    rawHtml: options.debug ? detailResp.data : undefined
  };
}

async function performSearch(query, type, token, options = {}) {
  const requestedPage = Number(options.page) > 0 ? Number(options.page) : 1;
  const requestedCity = String(options.city || '').trim();

  const response = await withRetry(() => runWithConcurrencyLimit(() => axios.get(SEARCH_ENDPOINT, {
    params: {
      q: query,
      type,
      token,
      'force-search': 1,
      page: requestedPage,
      ...(requestedCity ? { city: requestedCity } : {})
    },
    headers: DEFAULT_HEADERS,
    timeout: REQUEST_TIMEOUT_MS
  })));

  if (isCloudflareChallengeHtml(response.data)) {
    throw new Error('masothue.com đang hiển thị chống bot Cloudflare; tạm dừng để tránh gửi thêm request');
  }

  const finalUrl = getFinalUrl(response);
  const rawHtml = response.data;

  if (hasNoResultsNotification(rawHtml)) {
    return {
      finalUrl,
      rawHtml,
      parsed: {
        results: [],
        filters: [],
        pages: [],
        cities: [],
        currentPage: requestedPage,
        currentCity: requestedCity
      },
      noResults: true
    };
  }

  if (isDetailUrl(finalUrl)) {
    const parsed = parseSearchResults(rawHtml, type, finalUrl) || {
      results: [],
      filters: [],
      pages: [],
      cities: [],
      currentPage: requestedPage,
      currentCity: requestedCity
    };
    const detailResults = Array.isArray(parsed.results) ? parsed.results : [];
    const filtered = detailResults.filter((item) => matchesRequestedType(item, type));

    return {
      finalUrl,
      rawHtml,
      parsed: {
        results: filtered,
        filters: parsed.filters || [],
        pages: parsed.pages || [],
        cities: parsed.cities || [],
        currentPage: parsed.currentPage || requestedPage,
        currentCity: parsed.currentCity !== undefined ? parsed.currentCity : requestedCity
      },
      noResults: filtered.length === 0
    };
  }

  const parsed = parseSearchResults(rawHtml, type, finalUrl || SEARCH_ENDPOINT) || {
    results: [],
    filters: [],
    pages: [],
    cities: [],
    currentPage: requestedPage,
    currentCity: requestedCity
  };
  return {
    finalUrl,
    rawHtml,
    parsed,
    noResults: false
  };
}

/**
 * Search for tax information
 * @param {string} query - Search keyword
 * @param {string} type - Search type (auto, enterpriseTax, personalTax, identity, enterpriseName, legalName)
 * @returns {Promise<{results:Array, filters:Array, pages:Array, rawHtml?:string}>}
 */
async function searchTax(query, type = 'auto', options = {}) {
  try {
    const normalizedQuery = String(query || '').trim();
    const requestedPage = Number(options.page) > 0 ? Number(options.page) : 1;
    const requestedCity = String(options.city || '').trim();
    const cacheKey = getCacheKey(normalizedQuery, type, options);

    const cached = readCache(cacheKey);
    if (cached) {
      return cached;
    }

    if (inflightRequests.has(cacheKey)) {
      return inflightRequests.get(cacheKey);
    }

    const task = (async () => {
      if (isLikelyTaxCode(normalizedQuery)) {
        const overrideUrl = getExactDetailOverride(normalizedQuery);
        if (overrideUrl) {
          const overrideResult = await fetchDetailPage(overrideUrl, type, options);
          const first = overrideResult.results[0] || {};
          const tax = String(first.taxCode || first.personalTaxCode || first.identityNumber || '').trim();

          if (tax === normalizedQuery) {
            const response = { ...overrideResult };
            writeCache(cacheKey, response);
            return response;
          }
        }
      }

      const token = await fetchToken();
      const search = await performSearch(normalizedQuery, type, token, options);

      if (search.noResults) {
        const response = {
          results: [],
          filters: search.parsed.filters || [],
          pages: search.parsed.pages || [],
          cities: search.parsed.cities || [],
          currentPage: search.parsed.currentPage || requestedPage,
          currentCity: search.parsed.currentCity !== undefined ? search.parsed.currentCity : requestedCity,
          rawHtml: options.debug ? search.rawHtml : undefined
        };
        writeCache(cacheKey, response);
        return response;
      }

      const aggregated = Array.isArray(search.parsed.results) ? search.parsed.results.slice() : [];
      const filters = search.parsed.filters || [];
      const pages = search.parsed.pages || [];
      const cities = search.parsed.cities || [];
      const currentPage = search.parsed.currentPage || requestedPage;
      const currentCity = search.parsed.currentCity !== undefined ? search.parsed.currentCity : requestedCity;

      if (isLikelyTaxCode(normalizedQuery) && !isDetailUrl(search.finalUrl)) {
        const exactMatch = aggregated.find((item) => {
          const taxValue = String(item.taxCode || item.personalTaxCode || item.identityNumber || '').trim();
          return taxValue === normalizedQuery;
        });

        if (exactMatch && exactMatch.href) {
          const detailUrl = resolveUrl(exactMatch.href);
          const detailResult = await fetchDetailPage(detailUrl, type, options);

          if (detailResult.results.length > 0) {
            const response = {
              results: detailResult.results,
              filters: detailResult.filters.length ? detailResult.filters : filters,
              pages: detailResult.pages.length ? detailResult.pages : pages,
              cities: detailResult.cities.length ? detailResult.cities : cities,
              currentPage: detailResult.currentPage || currentPage,
              currentCity: detailResult.currentCity !== undefined ? detailResult.currentCity : currentCity,
              rawHtml: detailResult.rawHtml
            };
            writeCache(cacheKey, response);
            return response;
          }
        }
      }

      const response = {
        results: aggregated,
        filters,
        pages,
        cities,
        currentPage,
        currentCity,
        rawHtml: options.debug ? search.rawHtml : undefined
      };
      writeCache(cacheKey, response);
      return response;
    })();

    inflightRequests.set(cacheKey, task);

    try {
      return await task;
    } finally {
      inflightRequests.delete(cacheKey);
    }
  } catch (error) {
    const normalizedError = normalizeScrapeError(error);
    console.error('Search error:', normalizedError.message);
    throw new Error(`Failed to search: ${normalizedError.message}`);
  }
}

module.exports = {
  searchTax
};