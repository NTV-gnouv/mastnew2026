const cheerio = require('cheerio');

function normalizePath(sourceUrl) {
  try {
    return new URL(sourceUrl).pathname;
  } catch {
    return '';
  }
}

function parseSearchContext($, sourceUrl = '') {
  const filters = [];
  $('div.text-center').first().find('a, button, input[type="button"]').each((i, el) => {
    const $el = $(el);
    const label = $el.text().trim();
    const href = $el.attr('href') || $el.attr('data-href') || null;
    const value = $el.attr('value') || $el.attr('data-value') || null;
    if (label) filters.push({ label, href, value });
  });

  const pages = [];
  $('div.nav-links, nav.nav-links').first().find('a, span').each((i, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    const href = $el.is('a') ? ($el.attr('href') || null) : null;
    const isCurrent = $el.hasClass('current');
    if (text) {
      pages.push({ text, href, isCurrent });
    }
  });

  const cities = [];
  $('select.filter-select option').each((i, el) => {
    const $opt = $(el);
    const value = String($opt.attr('value') || '').trim();
    const label = $opt.text().trim();
    const selected = $opt.is(':selected');
    cities.push({ value, label, selected });
  });

  let currentPage = 1;
  const currentPageNode = pages.find((item) => item.isCurrent && /^\d+$/.test(item.text));
  if (currentPageNode) {
    currentPage = Number(currentPageNode.text);
  }

  let currentCity = '';
  const selectedCity = cities.find((item) => item.selected);
  if (selectedCity) {
    currentCity = selectedCity.value;
  }

  try {
    const urlObj = sourceUrl ? new URL(sourceUrl, 'https://masothue.com') : null;
    if (urlObj) {
      const qPage = Number(urlObj.searchParams.get('page') || 1);
      if (Number.isInteger(qPage) && qPage > 0) {
        currentPage = qPage;
      }
      const qCity = String(urlObj.searchParams.get('city') || '').trim();
      if (qCity) {
        currentCity = qCity;
      }
    }
  } catch {
    // ignore malformed URL
  }

  return {
    filters,
    pages,
    cities,
    currentPage,
    currentCity
  };
}

/**
 * Parse search results based on search type
 * @param {string} html - HTML content
 * @param {string} type - Search type
 * @param {string} sourceUrl - Final URL of the fetched page
 * @returns {Array} Parsed results
 */
function parseSearchResults(html, type, sourceUrl = '') {
  const $ = cheerio.load(html);
  const results = [];
  const path = normalizePath(sourceUrl);
  const isSearchPage = path === '/Search/' || path === '/Search';

  try {
    // On search pages, prefer result cards over any incidental detail table
    // embedded in the redirected HTML. This prevents a wrong redirect page
    // from hiding the actual exact-match card.
    if (isSearchPage && $('.tax-listing > div[data-prefetch]').length) {
      const parsed = parseMasothueCardResults($, type, sourceUrl);
      if (parsed && parsed.results) return parsed;
    }

    // Detail pages render the authoritative table-taxinfo.
    if ($('table.table-taxinfo, #table-taxinfo').length) {
      const parsed = parseTableTaxInfo($, type, sourceUrl);
      if (parsed && parsed.results) {
        return parsed; // return object { results, filters, pages }
      }
    }

    // Common patterns for different search types (fallback on search pages only)
    if (isSearchPage) {
      switch (type) {
        case 'enterpriseTax':
          results.push(...parseEnterpriseTaxResults($));
          break;
        case 'personalTax':
          results.push(...parsePersonalTaxResults($));
          break;
        case 'identity':
          results.push(...parseIdentityResults($));
          break;
        case 'enterpriseName':
          results.push(...parseEnterpriseNameResults($));
          break;
        case 'legalName':
          results.push(...parseLegalNameResults($));
          break;
        case 'auto':
        default:
          results.push(...parseAutoResults($));
          break;
      }
    }
  } catch (error) {
    console.error('Parse error:', error.message);
  }

  // Return unified object
  const context = parseSearchContext($, sourceUrl);
  return {
    results: results.length > 0 ? results : [],
    filters: context.filters,
    pages: context.pages,
    cities: context.cities,
    currentPage: context.currentPage,
    currentCity: context.currentCity
  };
}

/**
 * Parse table#table-taxinfo which is used by masothue.com to display results
 * Also extract filters from div.text-center and pagination links from nav-links
 */
function parseTableTaxInfo($, type, sourceUrl = '') {
  const results = [];
  const tableRoot = $('table.table-taxinfo, #table-taxinfo').first();

  const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const getCellText = (element) => normalizeText($(element).text());
  const getCellHtml = (element) => normalizeText($(element).html());

  const getText = (selector) => tableRoot.find(selector).first().text().replace(/\s+/g, ' ').trim();
  const getRowByLabel = (labelPattern) => {
    const row = tableRoot.find('tbody tr').filter((_, el) => {
      const firstCellText = $(el).find('td').first().text().replace(/\s+/g, ' ').trim();
      return labelPattern.test(firstCellText);
    }).first();
    return row.length ? row : null;
  };

  const title = getText('thead th .copy, thead th');
  const taxCode = getText('[itemprop="taxID"] .copy, [itemprop="taxID"]');
  const status = getText('#tax-status-html a, #tax-status-html');
  const representative = getText('[itemprop="name"] a, [itemprop="name"]');
  const managedByRow = getRowByLabel(/Quản\s*lý\s*bởi/i);
  const managedBy = managedByRow ? managedByRow.find('td').eq(1).text().replace(/\s+/g, ' ').trim() : '';

  let updatedAt = '';
  tableRoot.find('tbody tr').each((_, el) => {
    const rowText = $(el).text().replace(/\s+/g, ' ').trim();
    if (/Cập nhật mã số thuế/i.test(rowText)) {
      const updatedMatch = rowText.match(/lần cuối vào\s*([0-9:\-\s]+)/i);
      if (updatedMatch) updatedAt = updatedMatch[1].trim();
    }
  });

  const taxRow = getRowByLabel(/Mã số thuế cá nhân/i);
  const taxLabel = taxRow ? taxRow.find('td').first().text().replace(/\s+/g, ' ').trim() : '';

  const details = [];
  const fields = {};

  tableRoot.find('tbody tr').each((_, el) => {
    const $row = $(el);
    const cells = $row.find('td');
    const rowText = normalizeText($row.text());

    if (!cells.length) {
      return;
    }

    if (cells.length >= 2) {
      const label = getCellText(cells.eq(0));
      const value = getCellText(cells.eq(1));
      const valueHtml = normalizeText(cells.eq(1).html());

      if (label || value) {
        const detail = {
          label,
          value,
          valueHtml
        };
        details.push(detail);

        if (label) {
          if (Object.prototype.hasOwnProperty.call(fields, label)) {
            if (!Array.isArray(fields[label])) {
              fields[label] = [fields[label]];
            }
            fields[label].push(value);
          } else {
            fields[label] = value;
          }
        }
      }
      return;
    }

    if (cells.length === 1) {
      const colspanValue = getCellText(cells.eq(0));
      if (colspanValue) {
        details.push({
          label: '',
          value: colspanValue,
          valueHtml: normalizeText(cells.eq(0).html())
        });
      }
    }
  });

  const payload = {
    index: 1,
    type,
    title,
    taxCode: taxCode || '',
    taxLabel: taxLabel || '',
    status: status || '',
    representative: representative || '',
    managedBy: managedBy || '',
    updatedAt: updatedAt || '',
    details,
    fields
  };

  // For detail pages, return a single record only.
  if (payload.title || payload.taxCode || payload.status || payload.representative || payload.managedBy) {
    results.push(payload);
  }

  const context = parseSearchContext($, sourceUrl);

  return {
    results,
    filters: context.filters,
    pages: context.pages,
    cities: context.cities,
    currentPage: context.currentPage,
    currentCity: context.currentCity
  };
}

/**
 * Parse enterprise tax results
 */
function parseEnterpriseTaxResults($) {
  const results = [];
  
  // Look for result items - adjust selectors based on actual page structure
  $('.result-item, .search-result, .item, tr[data-tax]').each((index, element) => {
    const $el = $(element);
    
    const data = {
      index: index + 1,
      taxCode: $el.find('[data-tax], .tax-code, .maso-thue').text().trim() || '',
      enterpriseName: $el.find('[data-company], .company, .name, td:eq(0)').text().trim() || '',
      address: $el.find('[data-address], .address, td:eq(1)').text().trim() || '',
      tradeGroup: $el.find('[data-trade], .trade, td:eq(2)').text().trim() || '',
      registrationDate: $el.find('[data-date], .date, .registration-date, td:eq(3)').text().trim() || '',
      status: $el.find('[data-status], .status, td:eq(4)').text().trim() || ''
    };

    // Only add if has at least tax code or company name
    if (data.taxCode || data.enterpriseName) {
      results.push(data);
    }
  });

  return results;
}

/**
 * Parse personal tax results
 */
function parsePersonalTaxResults($) {
  const results = [];
  
  $('.result-item, .search-result, .item, tr[data-tax]').each((index, element) => {
    const $el = $(element);
    
    const data = {
      index: index + 1,
      personalTaxCode: $el.find('[data-tax], .tax-code, .maso-thue').text().trim() || '',
      fullName: $el.find('[data-name], .name, .full-name, td:eq(0)').text().trim() || '',
      dateOfBirth: $el.find('[data-dob], .dob, .birth-date, td:eq(1)').text().trim() || '',
      address: $el.find('[data-address], .address, td:eq(2)').text().trim() || '',
      registrationDate: $el.find('[data-date], .date, .registration-date, td:eq(3)').text().trim() || '',
      status: $el.find('[data-status], .status, td:eq(4)').text().trim() || ''
    };

    if (data.personalTaxCode || data.fullName) {
      results.push(data);
    }
  });

  return results;
}

/**
 * Parse identity results (CMND, căn cước)
 */
function parseIdentityResults($) {
  const results = [];
  
  $('.result-item, .search-result, .item, tr[data-id]').each((index, element) => {
    const $el = $(element);
    
    const data = {
      index: index + 1,
      identityNumber: $el.find('[data-id], .id-number, .cmnd, td:eq(0)').text().trim() || '',
      fullName: $el.find('[data-name], .name, .full-name, td:eq(1)').text().trim() || '',
      dateOfBirth: $el.find('[data-dob], .dob, .birth-date, td:eq(2)').text().trim() || '',
      address: $el.find('[data-address], .address, td:eq(3)').text().trim() || '',
      taxCode: $el.find('[data-tax], .tax-code, td:eq(4)').text().trim() || '',
      status: $el.find('[data-status], .status, td:eq(5)').text().trim() || ''
    };

    if (data.identityNumber || data.fullName) {
      results.push(data);
    }
  });

  return results;
}

/**
 * Parse enterprise name results
 */
function parseEnterpriseNameResults($) {
  const results = [];
  
  $('.result-item, .search-result, .item, tr[data-company]').each((index, element) => {
    const $el = $(element);
    
    const data = {
      index: index + 1,
      enterpriseName: $el.find('[data-company], .company, .name, td:eq(0)').text().trim() || '',
      taxCode: $el.find('[data-tax], .tax-code, .maso-thue, td:eq(1)').text().trim() || '',
      address: $el.find('[data-address], .address, td:eq(2)').text().trim() || '',
      tradeGroup: $el.find('[data-trade], .trade, td:eq(3)').text().trim() || '',
      status: $el.find('[data-status], .status, td:eq(4)').text().trim() || ''
    };

    if (data.enterpriseName || data.taxCode) {
      results.push(data);
    }
  });

  return results;
}

/**
 * Parse legal representative (Giám đốc công ty) results
 */
function parseLegalNameResults($) {
  const results = [];
  
  $('.result-item, .search-result, .item, tr[data-legal]').each((index, element) => {
    const $el = $(element);
    
    const data = {
      index: index + 1,
      legalRepresentative: $el.find('[data-legal], .legal, .director, td:eq(0)').text().trim() || '',
      enterpriseName: $el.find('[data-company], .company, .name, td:eq(1)').text().trim() || '',
      taxCode: $el.find('[data-tax], .tax-code, .maso-thue, td:eq(2)').text().trim() || '',
      position: $el.find('[data-position], .position, td:eq(3)').text().trim() || '',
      status: $el.find('[data-status], .status, td:eq(4)').text().trim() || ''
    };

    if (data.legalRepresentative || data.enterpriseName) {
      results.push(data);
    }
  });

  return results;
}

/**
 * Parse auto search results (returns all relevant data)
 */
function parseAutoResults($) {
  const results = [];
  
  // Try all possible result patterns
  $('.result-item, .search-result, .item, tr[data-id], tr[data-tax]').each((index, element) => {
    const $el = $(element);
    
    const data = {
      index: index + 1,
      taxCode: $el.find('[data-tax], .tax-code, .maso-thue, td:eq(0), td:eq(1)').text().trim() || '',
      identityNumber: $el.find('[data-id], .id-number, .cmnd').text().trim() || '',
      enterpriseName: $el.find('[data-company], .company, .name').text().trim() || '',
      fullName: $el.find('[data-name], .full-name, .legal').text().trim() || '',
      address: $el.find('[data-address], .address').text().trim() || '',
      status: $el.find('[data-status], .status').text().trim() || ''
    };

    // Filter out empty objects
    const hasData = Object.values(data).some(val => val && val !== index + 1);
    if (hasData) {
      results.push(data);
    }
  });

  return results;
}

module.exports = {
  parseSearchResults
};

/**
 * Parse masothue.com div-based result cards
 * @param {*} $ - cheerio instance
 * @returns {Object} { results, filters, pages }
 */
function parseMasothueCardResults($, type, sourceUrl = '') {
  const results = [];
  const cards = $('.tax-listing div[data-prefetch]');

  cards.each((i, el) => {
    const $el = $(el);
    const href = $el.find('h3 a').first().attr('href') || $el.attr('data-prefetch') || '';
    const name = $el.find('h3 a').first().text().trim() || '';

    // tax code often follows an icon with fa-hashtag and is inside a link
    let taxCode = '';
    const hashtag = $el.find('i.fa-hashtag').first();
    if (hashtag && hashtag.length) {
      const a = hashtag.parent().find('a').first();
      taxCode = a.text().trim() || '';
    }

    // representative (Người đại diện)
    let representative = '';
    const userIcon = $el.find('i.fa-user').first();
    if (userIcon && userIcon.length) {
      // may be inside an <em> tag
      representative = userIcon.parent().find('em a').first().text().trim() || userIcon.parent().find('em').first().text().trim() || '';
    }

    // address
    const address = $el.find('address').first().text().replace(/\s+/g, ' ').trim() || '';

    const item = {
      index: i + 1,
      enterpriseName: name,
      taxCode,
      representative,
      address,
      href
    };

    // Only include if there's some identifying data
    if (name || taxCode) results.push(item);
  });

  const context = parseSearchContext($, sourceUrl);
  return {
    results,
    filters: context.filters,
    pages: context.pages,
    cities: context.cities,
    currentPage: context.currentPage,
    currentCity: context.currentCity
  };
}
