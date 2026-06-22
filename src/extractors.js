import { PDP } from './selectors.js';
import { parsePrice } from './utils.js';

// ─── Low-level helpers ────────────────────────────────────────────────────────

/** Try each selector in the list; return trimmed text of the first match. */
async function tryText(page, selectors) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const sel of list) {
    try {
      const el = await page.$(sel);
      if (el) {
        const text = (await el.textContent())?.trim();
        if (text) return text;
      }
    } catch { /* continue */ }
  }
  return null;
}

/** Try each selector; return an array of trimmed, non-empty text values. */
async function tryTextAll(page, selectors) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const sel of list) {
    try {
      const els = await page.$$(sel);
      if (els.length > 0) {
        const texts = await Promise.all(els.map((el) => el.textContent()));
        const result = texts.map((t) => t?.trim()).filter(Boolean);
        if (result.length > 0) return result;
      }
    } catch { /* continue */ }
  }
  return [];
}

// ─── Core Identity ────────────────────────────────────────────────────────────

export async function extractTitle(page) {
  return (await tryText(page, PDP.title)) ?? null;
}

export async function extractBrand(page) {
  const raw = await tryText(page, PDP.brand);
  if (!raw) return null;
  // Strip "Visit the … Store", "Brand: ", "by " prefixes
  return raw.replace(/^(Visit the\s+.+\s+Store|Brand\s*[:\u200F\u200E]\s*|by\s+)/i, '').trim() || null;
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

export async function extractPrice(page) {
  return parsePrice(await tryText(page, PDP.price));
}

export async function extractOriginalPrice(page) {
  return parsePrice(await tryText(page, PDP.originalPrice));
}

export async function extractDiscountPercent(page) {
  const raw = await tryText(page, PDP.discountPercent);
  if (!raw) return null;
  const m = raw.match(/(\d+)\s*%/);
  return m ? parseInt(m[1], 10) : null;
}

export async function extractDealBadge(page) {
  return (await tryText(page, PDP.dealBadge)) ?? null;
}

// ─── Media ────────────────────────────────────────────────────────────────────

/**
 * Extract hi-res image URLs.
 *
 * Strategy:
 *   1. Parse the `colorImages.initial` JSON blob embedded in a <script> tag —
 *      this gives the full gallery at maximum resolution.
 *   2. Fall back to `#landingImage` + `#altImages` thumbnail srcs, upgrading
 *      their resolution by patching the URL size token.
 */
export async function extractImages(page) {
  const fromScript = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script'));
    const target = scripts.find(
      (s) => s.textContent.includes("'colorImages'") || s.textContent.includes('"colorImages"'),
    );
    if (!target) return null;

    const text = target.textContent;
    const start = text.indexOf("'colorImages'");
    if (start === -1) return null;

    const arrayStart = text.indexOf('[', start);
    if (arrayStart === -1) return null;

    // Walk bracket depth to find the matching closing bracket
    let depth = 0;
    let arrayEnd = -1;
    for (let i = arrayStart; i < text.length; i++) {
      if (text[i] === '[') depth++;
      else if (text[i] === ']') {
        depth--;
        if (depth === 0) { arrayEnd = i; break; }
      }
    }
    if (arrayEnd === -1) return null;

    try {
      const entries = JSON.parse(text.slice(arrayStart, arrayEnd + 1));
      return entries
        .map((img) => {
          if (img.hiRes) return img.hiRes;
          if (img.large) return img.large;
          if (img.main) return Object.keys(img.main)[0];
          return null;
        })
        .filter(Boolean);
    } catch {
      return null;
    }
  });

  if (fromScript?.length) return fromScript;

  // Fallback: scrape visible image elements
  return await page.evaluate(() => {
    const hiRes = (src) =>
      src.replace(/\._[A-Z]{2}\d+_\./, '._SL1500_.')
         .replace(/\._[A-Z]+,\w+_\./, '._SL1500_.');

    const main = document.querySelector('#landingImage, #imgBlkFront');
    const mainSrc = main
      ? (main.getAttribute('data-old-hires') || main.getAttribute('src'))
      : null;

    const altSrcs = Array.from(
      document.querySelectorAll('#altImages .a-button-thumbnail img, #imageBlockThumbs img'),
    )
      .map((img) => img.getAttribute('src') || '')
      .filter((s) => s && !s.includes('play-button') && !s.includes('transparent-pixel'))
      .map(hiRes);

    return [mainSrc ? hiRes(mainSrc) : null, ...altSrcs].filter(Boolean);
  });
}

export async function extractVideoUrl(page) {
  return await page.evaluate(() => {
    const src = document.querySelector(
      '#vse-vjs-player video source[src], .video-js source[src]',
    );
    return src ? src.getAttribute('src') : null;
  });
}

// ─── Description & Content ────────────────────────────────────────────────────

export async function extractFeatureBullets(page) {
  const texts = await tryTextAll(page, PDP.featureBullets);
  return texts.length ? texts : null;
}

export async function extractDescription(page) {
  const texts = await tryTextAll(page, PDP.description);
  if (!texts.length) return null;
  return texts.join(' ').replace(/\s+/g, ' ').trim() || null;
}

export async function extractAPlus(page) {
  const texts = await tryTextAll(page, PDP.aplus);
  if (!texts.length) return null;
  return texts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 5000) || null;
}

// ─── Product Details / Specifications ────────────────────────────────────────

/**
 * Merge data from both table-row format (#productDetails_techSpec_section_*)
 * and detail-bullets format (#detailBulletsWrapper_feature_div).
 * Returns a flat key→value object, or null when nothing is found.
 */
export async function extractProductDetails(page) {
  return await page.evaluate(() => {
    const ZERO_WIDTH = /[\u200F\u200E  ]/g;
    const clean = (s) => s.replace(ZERO_WIDTH, '').replace(/\s+/g, ' ').trim();

    const result = {};

    // Table rows (tech spec tables)
    const tableSelectors = [
      '#productDetails_techSpec_section_1 tr',
      '#productDetails_techSpec_section_2 tr',
      '#productDetails_db_sections tr',
    ];
    for (const sel of tableSelectors) {
      document.querySelectorAll(sel).forEach((row) => {
        const th = row.querySelector('th');
        const td = row.querySelector('td');
        if (th && td) {
          const key = clean(th.textContent).replace(/:$/, '');
          const val = clean(td.textContent);
          if (key && val) result[key] = val;
        }
      });
    }

    // Detail-bullets format
    document.querySelectorAll(
      '#detailBulletsWrapper_feature_div ul li, #detailBullets li',
    ).forEach((li) => {
      const bold = li.querySelector('.a-text-bold');
      if (!bold) return;
      const key = clean(bold.textContent).replace(/:$/, '');
      const full = clean(li.textContent);
      const keyLen = clean(bold.textContent).length;
      const val = full.slice(keyLen).replace(/^[\s:]+/, '').trim();
      if (key && val) result[key] = val;
    });

    return Object.keys(result).length ? result : null;
  });
}

export async function extractItemDetails(page) {
  return await page.evaluate(() => {
    const ZERO_WIDTH = /[\u200F\u200E  ]/g;
    const clean = (s) => s.replace(ZERO_WIDTH, '').replace(/\s+/g, ' ').trim();
    const result = {};

    document.querySelectorAll('#productDetails_db_sections tr').forEach((row) => {
      const th = row.querySelector('th');
      const td = row.querySelector('td');
      if (th && td) {
        const key = clean(th.textContent).replace(/:$/, '');
        const val = clean(td.textContent);
        if (key && val) result[key] = val;
      }
    });

    return Object.keys(result).length ? result : null;
  });
}

// ─── Ratings & Social Proof ───────────────────────────────────────────────────

export async function extractRating(page) {
  const raw = await tryText(page, PDP.rating);
  if (!raw) return null;
  const m = raw.match(/(\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : null;
}

export async function extractReviewCount(page) {
  const raw = await tryText(page, PDP.reviewCount);
  if (!raw) return null;
  const m = raw.match(/([\d,]+)/);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
}

/**
 * Best Seller Rank — returns an array of { rank, category } objects, or null.
 * Looks in both the legacy #SalesRank element and the detail-bullets section.
 */
export async function extractBSR(page) {
  return await page.evaluate(() => {
    const results = [];

    const parseRanks = (text) => {
      const re = /#([\d,]+)\s+in\s+([^(#\n]+)/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        results.push({
          rank: parseInt(m[1].replace(/,/g, ''), 10),
          category: m[2].trim().replace(/\s+/g, ' '),
        });
      }
    };

    const salesRank = document.querySelector('#SalesRank');
    if (salesRank) parseRanks(salesRank.textContent);

    document.querySelectorAll(
      '#detailBulletsWrapper_feature_div li, #detailBullets li',
    ).forEach((li) => {
      if (/Best Sellers? Rank/i.test(li.textContent)) parseRanks(li.textContent);
    });

    return results.length ? results : null;
  });
}

// ─── Logistics ────────────────────────────────────────────────────────────────

export async function extractAvailability(page) {
  const raw = await tryText(page, PDP.availability);
  return raw ? raw.replace(/\s+/g, ' ').trim() : null;
}

export async function extractSoldBy(page) {
  return (await tryText(page, PDP.soldBy)) ?? null;
}

export async function extractFulfilledBy(page) {
  const raw = await page.evaluate(() => {
    const el = document.querySelector('#fulfilledByThirdParty, #merchant-info');
    return el ? el.textContent.trim() : null;
  });
  if (!raw) return null;
  if (/amazon/i.test(raw)) return 'Amazon';
  return raw.replace(/\s+/g, ' ').trim();
}

export async function extractDeliveryInfo(page) {
  return (await tryText(page, PDP.deliveryInfo)) ?? null;
}

// ─── Breadcrumbs ─────────────────────────────────────────────────────────────

export async function extractBreadcrumbs(page) {
  return await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll('#wayfinding-breadcrumbs_feature_div li'),
    )
      .map((li) => li.textContent.trim().replace(/›/g, '').trim())
      .filter((t) => t && t !== '›');
  });
}

// ─── Derived / Parsed Fields ──────────────────────────────────────────────────

/** Pull dimensions out of productDetails and return a { length, width, height, unit } object. */
export function parseMeasurements(details) {
  if (!details) return null;
  const keys = [
    'Product Dimensions', 'Package Dimensions', 'Item Dimensions LxWxH',
    'Item Dimensions', 'Dimensions', 'Product Size',
  ];
  for (const key of keys) {
    const val = details[key];
    if (!val) continue;
    const m = val.match(/([\d.]+)\s*[xX×]\s*([\d.]+)\s*[xX×]\s*([\d.]+)\s*(\w+)?/);
    if (m) {
      return {
        length: parseFloat(m[1]),
        width:  parseFloat(m[2]),
        height: parseFloat(m[3]),
        unit:   (m[4] || 'cm').toLowerCase(),
      };
    }
  }
  return null;
}

/** Pull weight out of productDetails and return a { value, unit } object. */
export function parseWeight(details) {
  if (!details) return null;
  const keys = ['Item Weight', 'Package Weight', 'Product Weight', 'Weight'];
  for (const key of keys) {
    const val = details[key];
    if (!val) continue;
    const m = val.match(/([\d.]+)\s*(kg|g|lbs?|oz|grams?|kilograms?)/i);
    if (m) return { value: parseFloat(m[1]), unit: m[2].toLowerCase() };
  }
  return null;
}

/** Return the first non-null value found under any of the given keys. */
export function pickField(details, ...keys) {
  if (!details) return null;
  for (const key of keys) {
    if (details[key] != null) return details[key];
  }
  return null;
}
