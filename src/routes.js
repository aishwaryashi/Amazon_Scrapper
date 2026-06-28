import { createPlaywrightRouter, KeyValueStore } from 'crawlee';
import { LISTING } from './selectors.js';
import {
  extractTitle, extractBrand,
  extractPrice, extractOriginalPrice, extractDiscountPercent, extractDealBadge,
  extractImages, extractVideoUrl,
  extractFeatureBullets, extractDescription, extractAPlus,
  extractProductDetails, extractItemDetails,
  extractRating, extractReviewCount, extractBSR,
  extractAvailability, extractSoldBy, extractFulfilledBy, extractDeliveryInfo,
  extractBreadcrumbs, extractUserGuide, extractImportantInfo,
  parseMeasurements, parseWeight, pickField,
} from './extractors.js';
import { parseAsin, currencyFor, randomDelay, canonicalUrl } from './utils.js';

export const router = createPlaywrightRouter();

// ─── Listing / SERP pages ─────────────────────────────────────────────────────

router.addHandler('LISTING', async ({ page, request, enqueueLinks, log }) => {
  const { maxPages, maxProducts, locale, pageNum } = request.userData;
  const url = request.url;

  // Detect page layout: Bestsellers (/gp/bestsellers/ or /zgbs/) vs standard search SERP
  const isBestsellers = /\/(gp\/bestsellers|zgbs)\//.test(url);

  log.info(`[LISTING] page ${pageNum} [${isBestsellers ? 'bestsellers' : 'search'}]: ${url}`);

  let allLinks = [];
  let nextUrl   = null;

  if (isBestsellers) {
    // ── Bestsellers layout (/gp/bestsellers/... or /zgbs/...) ────────────────
    //
    // Amazon India's bestseller layout changes frequently and no longer uses
    // stable class names like .zg-item-immersion.  Instead we:
    //   1. Wait for ANY /dp/ anchor to appear (universal signal that products loaded)
    //   2. Extract unique ASINs from /dp/ links scoped to the product grid
    //   3. Build canonical URLs from each ASIN
    //
    // This approach survives layout changes because /dp/<ASIN> is a permanent
    // Amazon URL pattern that will never change.

    const origin = new URL(url).origin; // e.g. "https://www.amazon.in"

    // Wait up to 20 s for any product link — gives time for lazy-loaded grids
    await page.waitForSelector('a[href*="/dp/"]', { timeout: 20_000 }).catch(() => {
      log.warning(`[LISTING] No /dp/ links appeared on bestseller page ${pageNum}`);
    });

    // Extra settle time for JS-rendered grids
    await page.waitForTimeout(2500);

    // Log the first 300 chars of body for debugging if needed
    const gridDebug = await page.evaluate(() => {
      const grid = document.querySelector('#zg-ordered-list, #zg-right-col, .p13n-desktop-grid');
      return grid ? `found: ${grid.id || grid.className.slice(0, 60)}` : 'no grid container found';
    });
    log.info(`[LISTING] Grid container: ${gridDebug}`);

    allLinks = await page.evaluate((origin) => {
      const seen  = new Set();
      const asinRe = /\/dp\/([A-Z0-9]{10})/i;

      // Prefer a scoped grid container; fall back to full body
      const containers = [
        '#zg-ordered-list',
        '#zg-right-col',
        '.p13n-desktop-grid',
        'body',
      ];

      let root = null;
      for (const sel of containers) {
        root = document.querySelector(sel);
        if (root) break;
      }

      const results = [];
      root.querySelectorAll('a[href*="/dp/"]').forEach((a) => {
        const m = a.href.match(asinRe);
        if (!m) return;
        const asin = m[1].toUpperCase();
        if (!seen.has(asin)) {
          seen.add(asin);
          results.push(`${origin}/dp/${asin}`);
        }
      });

      return results;
    }, origin);

    // Next-page: scope to main column to avoid grabbing sidebar pagination
    nextUrl = await page.evaluate(() => {
      const col  = document.querySelector('#zg-right-col') || document.body;
      const next = col.querySelector('ul.a-pagination .a-last a, li.a-last a');
      return next ? next.href : null;
    });

  } else {
    // ── Standard search / category SERP (/s?... or /s/...) ──────────────────
    await page.waitForSelector(LISTING.productCard, { timeout: 15_000 }).catch(() => {
      log.warning(`[LISTING] No product cards found on page ${pageNum}`);
    });

    allLinks = await page.evaluate((sel) => {
      return Array.from(document.querySelectorAll(sel.productCard))
        .map((card) => card.querySelector(sel.productLink)?.href ?? null)
        .filter(Boolean);
    }, LISTING);

    nextUrl = await page.evaluate((sel) => {
      const btn = document.querySelector(sel.nextPage);
      return btn ? btn.href : null;
    }, LISTING);
  }

  log.info(`[LISTING] Found ${allLinks.length} product links on page ${pageNum}`);

  // ── Honour maxProducts cap ────────────────────────────────────────────────
  const store = await KeyValueStore.open();
  const enqueuedSoFar = (await store.getValue('enqueuedCount')) ?? 0;

  let linksToQueue = allLinks;
  if (maxProducts) {
    const remaining = maxProducts - enqueuedSoFar;
    if (remaining <= 0) {
      log.info('[LISTING] maxProducts cap reached — stopping pagination');
      return;
    }
    linksToQueue = allLinks.slice(0, remaining);
  }

  if (linksToQueue.length > 0) {
    await enqueueLinks({
      urls: linksToQueue.map(canonicalUrl),
      label: 'PDP',
      userData: { locale },
    });
    await store.setValue('enqueuedCount', enqueuedSoFar + linksToQueue.length);
    log.info(`[LISTING] Enqueued ${linksToQueue.length} PDPs (total: ${enqueuedSoFar + linksToQueue.length})`);
  }

  // ── Paginate ──────────────────────────────────────────────────────────────
  const capReached = maxProducts && (enqueuedSoFar + linksToQueue.length) >= maxProducts;
  if (!capReached && pageNum < maxPages) {
    if (nextUrl) {
      await enqueueLinks({
        urls: [nextUrl],
        label: 'LISTING',
        userData: { maxPages, maxProducts, locale, pageNum: pageNum + 1 },
      });
      log.info(`[LISTING] Enqueued next page ${pageNum + 1}: ${nextUrl}`);
    } else {
      log.info('[LISTING] No next page — category exhausted');
    }
  }

  await randomDelay();
});

// ─── Product detail pages ─────────────────────────────────────────────────────

router.addHandler('PDP', async ({ page, request, pushData, log }) => {
  const { locale } = request.userData;
  const url = request.url;

  const pageTitle = await page.title();
  log.info(`[PDP] "${pageTitle}" — ${url}`);

  // ── Step 1: title-based bot-block detection ──────────────────────────────
  // IMPORTANT: throw (don't return) so Crawlee retries with a new session + fingerprint.
  const titleBlocked = await page.evaluate(() =>
    document.title.includes('Robot Check') ||
    document.title.includes('CAPTCHA') ||
    document.title.includes('Sorry') ||
    document.title.includes('Just a moment') ||
    document.title.includes('Page not found') ||
    document.title.includes('404') ||
    !!document.querySelector('form[action*="captcha"]') ||
    !!document.querySelector('#captchacharacters'),
  );

  if (titleBlocked) {
    log.warning(`[PDP] Bot-block/CAPTCHA detected (title: "${pageTitle}") — will retry`);
    throw new Error(`Bot-block on ${url}`);
  }

  // ── Step 2: wait for actual product content ───────────────────────────────
  // Wait for #productTitle specifically (not just #dp wrapper) so we know
  // the product section is present, not just the page skeleton.
  await page.waitForSelector('#productTitle', { timeout: 20_000 }).catch(() => {
    log.warning(`[PDP] Timeout waiting for #productTitle on: ${url}`);
  });

  // ── Step 3: content-level bot-block detection ─────────────────────────────
  // Amazon sometimes serves "ghost" pages — the #productTitle element exists but
  // has no text, and all product sections are empty. This is a silent bot-block
  // that bypasses title-based checks. Detect it and force a retry.
  const titleText = await page.$eval('#productTitle', el => el.textContent.trim()).catch(() => '');
  if (!titleText) {
    // Capture a screenshot so we can see what Amazon actually served
    const screenshotBuffer = await page.screenshot({ fullPage: false }).catch(() => null);
    if (screenshotBuffer) {
      const store = await KeyValueStore.open();
      const asinForLog = parseAsin(url) ?? 'unknown';
      await store.setValue(`blocked_screenshot_${asinForLog}`, screenshotBuffer, { contentType: 'image/png' });
      log.warning(`[PDP] Saved blocked-page screenshot to KV store: blocked_screenshot_${asinForLog}`);
    }
    log.warning(`[PDP] Page loaded but #productTitle is empty — silent bot-block, will retry: ${url}`);
    throw new Error(`Silent bot-block (empty title) on ${url}`);
  }

  // Expand accordion sections — two passes to catch nested sub-panels
  // (e.g. "Additional details" inside #poExpander which is itself inside
  // the product-information accordion).
  const expandAll = () => {
    document.querySelectorAll(
      '.a-expander-prompt, [data-action="a-expander-toggle"]',
    ).forEach((el) => { try { el.click(); } catch { /* ignore */ } });
  };
  await page.evaluate(expandAll).catch(() => {});
  await page.waitForTimeout(1200);   // let first-pass sections render
  await page.evaluate(expandAll).catch(() => {});
  await page.waitForTimeout(800);    // let second-pass sub-sections render

  // Extract the product details table first — several derived fields depend on it
  const productDetails = await extractProductDetails(page);

  // Run all remaining extractions concurrently
  const [
    title, brand,
    price, originalPrice, discountPercent, dealBadge,
    imageUrls, videoUrl,
    featuresBullets, productDescriptionText, aPlus,
    itemDetails,
    rating, reviewCount, bestSellerRank,
    availability, soldBy, fulfilledBy, deliveryInfo,
    category, userGuide, importantInfo,
  ] = await Promise.all([
    extractTitle(page),
    extractBrand(page),
    extractPrice(page),
    extractOriginalPrice(page),
    extractDiscountPercent(page),
    extractDealBadge(page),
    extractImages(page),
    extractVideoUrl(page),
    extractFeatureBullets(page),    // "About this item" bullet points
    extractDescription(page),       // #productDescription long-form text
    extractAPlus(page),             // "From the manufacturer" / A+ content
    extractItemDetails(page),
    extractRating(page),
    extractReviewCount(page),
    extractBSR(page),
    extractAvailability(page),
    extractSoldBy(page),
    extractFulfilledBy(page),
    extractDeliveryInfo(page),
    extractBreadcrumbs(page),
    extractUserGuide(page),         // downloadable PDF guide URL
    extractImportantInfo(page),     // safety / legal warnings
  ]);

  const asin         = parseAsin(url);
  const measurements = parseMeasurements(productDetails);
  const weight       = parseWeight(productDetails);

  const product = {
    // ── Core Identity ──────────────────────────────────────────────────────
    asin,
    title,
    brand,
    productUrl: canonicalUrl(url),

    // ── Media ─────────────────────────────────────────────────────────────
    // imageUrls: full hi-res gallery (main + all carousel images)
    imageUrls: imageUrls?.length ? imageUrls : null,
    videoUrl,

    // ── Pricing ───────────────────────────────────────────────────────────
    price,
    currency:        currencyFor(locale),
    originalPrice,   // M.R.P. / list price before discount
    discountPercent,
    dealBadge,       // "Lightning Deal", "Coupon", etc. — null if none

    // ── Features & Description ────────────────────────────────────────────
    // description    : "About this item" bullet array (per schema spec)
    // featuresBullets: same bullets (explicit alias for clarity)
    // productDescription : long-form text from the #productDescription section
    description:          featuresBullets,
    featuresBullets,
    productDescription:   productDescriptionText,

    // ── Product Details / Technical Specs ─────────────────────────────────
    // productDetails : merged key→value from all spec tables + detail bullets
    // itemDetails    : key→value from the "Item details" accordion section
    productDetails,
    itemDetails,

    // ── A+ / From the Manufacturer ────────────────────────────────────────
    aPlus,

    // ── User Guide ────────────────────────────────────────────────────────
    userGuide,         // URL to downloadable PDF guide, or null

    // ── Important / Safety Information ────────────────────────────────────
    importantInfo,     // age warnings, choking hazard text, compliance notes

    // ── Specifications (derived from productDetails) ───────────────────────
    measurements,      // { length, width, height, unit }
    weight,            // { value, unit }
    // 'Theme' and 'Character' come from the #poExpander "Style" sub-section
    style:            pickField(productDetails, 'Style', 'Theme', 'Character',
                                'Colour', 'Color', 'Size', 'Pattern'),
    material:         pickField(productDetails, 'Material', 'Material Type', 'Fabric',
                                'Material Composition', 'Filling Material'),
    careInstructions: pickField(productDetails, 'Care Instructions', 'Care instructions',
                                'Care Instruction', 'Washing Instructions'),

    // ── Categorisation ────────────────────────────────────────────────────
    category:        category?.length ? category : null,
    ageRange:        pickField(productDetails, 'Age Range', 'Recommended Age',
                               'Age range', 'Age Recommendation'),
    manufacturer:    pickField(productDetails, 'Manufacturer', 'Brand'),
    countryOfOrigin: pickField(productDetails, 'Country of Origin', 'Country Of Origin'),

    // ── Ratings & Social Proof ────────────────────────────────────────────
    rating,
    reviewCount,
    bestSellerRank,  // [{ rank, category }, ...]

    // ── Logistics ─────────────────────────────────────────────────────────
    availability,
    soldBy,
    fulfilledBy,
    deliveryInfo,

    // ── Meta ──────────────────────────────────────────────────────────────
    scrapedAt: new Date().toISOString(),
    locale,
  };

  await pushData(product);
  log.info(`[PDP] Saved: "${title}" (ASIN: ${asin})`);

  await randomDelay();
});

// ─── Default fallback ─────────────────────────────────────────────────────────

router.addDefaultHandler(async ({ request, log }) => {
  log.warning(`[ROUTER] No handler matched — skipping: ${request.url}`);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _logFailedAsin(url) {
  const store = await KeyValueStore.open();
  const asin = parseAsin(url);
  if (!asin) return;
  const list = (await store.getValue('failedAsins')) ?? [];
  if (!list.includes(asin)) {
    list.push(asin);
    await store.setValue('failedAsins', list);
  }
}
