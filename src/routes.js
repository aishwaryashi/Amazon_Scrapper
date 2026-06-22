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
  extractBreadcrumbs,
  parseMeasurements, parseWeight, pickField,
} from './extractors.js';
import { parseAsin, currencyFor, randomDelay, canonicalUrl } from './utils.js';

export const router = createPlaywrightRouter();

// ─── Listing / SERP pages ─────────────────────────────────────────────────────

router.addHandler('LISTING', async ({ page, request, enqueueLinks, log }) => {
  const { maxPages, maxProducts, locale, pageNum } = request.userData;

  log.info(`[LISTING] page ${pageNum}: ${request.url}`);

  // Wait for at least one product card to appear (up to 15 s)
  await page.waitForSelector(LISTING.productCard, { timeout: 15_000 }).catch(() => {
    log.warning(`[LISTING] No product cards found on page ${pageNum}`);
  });

  // Collect every product href on this page
  const allLinks = await page.evaluate((sel) => {
    return Array.from(
      document.querySelectorAll(sel.productCard),
    ).map((card) => {
      const anchor = card.querySelector(sel.productLink);
      return anchor?.href ?? null;
    }).filter(Boolean);
  }, LISTING);

  log.info(`[LISTING] Found ${allLinks.length} product links on page ${pageNum}`);

  // Honour maxProducts cap using a KV-store counter so concurrent handlers agree
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

  // Paginate if we haven't hit the page limit or product cap
  const capReached = maxProducts && (enqueuedSoFar + linksToQueue.length) >= maxProducts;
  if (!capReached && pageNum < maxPages) {
    const nextUrl = await page.evaluate((sel) => {
      const btn = document.querySelector(sel.nextPage);
      return btn ? btn.href : null;
    }, LISTING);

    if (nextUrl) {
      await enqueueLinks({
        urls: [nextUrl],
        label: 'LISTING',
        userData: { maxPages, maxProducts, locale, pageNum: pageNum + 1 },
      });
      log.info(`[LISTING] Enqueued next page ${pageNum + 1}: ${nextUrl}`);
    } else {
      log.info('[LISTING] No next page button — category exhausted');
    }
  }

  await randomDelay();
});

// ─── Product detail pages ─────────────────────────────────────────────────────

router.addHandler('PDP', async ({ page, request, pushData, log }) => {
  const { locale } = request.userData;
  const url = request.url;

  log.info(`[PDP] ${url}`);

  // Detect CAPTCHA / bot-block pages
  const blocked = await page.evaluate(() =>
    document.title.includes('Robot Check') ||
    document.title.includes('CAPTCHA') ||
    !!document.querySelector('form[action*="captcha"]'),
  );

  if (blocked) {
    log.warning(`[PDP] Bot-block detected — skipping ${url}`);
    await _logFailedAsin(url);
    return;
  }

  // Wait for the product title or the main DP wrapper
  await page.waitForSelector('#productTitle, #dp', { timeout: 20_000 }).catch(() => {
    log.warning(`[PDP] Timeout waiting for page content: ${url}`);
  });

  // Expand collapsed accordion sections (product details, tech specs, etc.)
  await page.evaluate(() => {
    document.querySelectorAll(
      '.a-expander-prompt, [data-action="a-expander-toggle"]',
    ).forEach((el) => { try { el.click(); } catch { /* ignore */ } });
  }).catch(() => {});

  // Brief wait so newly expanded sections can render
  await page.waitForTimeout(600);

  // Extract the product details table first — several derived fields depend on it
  const productDetails = await extractProductDetails(page);

  // Run all remaining extractions concurrently
  const [
    title, brand,
    price, originalPrice, discountPercent, dealBadge,
    imageUrls, videoUrl,
    featuresBullets, description, aPlus,
    itemDetails,
    rating, reviewCount, bestSellerRank,
    availability, soldBy, fulfilledBy, deliveryInfo,
    category,
  ] = await Promise.all([
    extractTitle(page),
    extractBrand(page),
    extractPrice(page),
    extractOriginalPrice(page),
    extractDiscountPercent(page),
    extractDealBadge(page),
    extractImages(page),
    extractVideoUrl(page),
    extractFeatureBullets(page),
    extractDescription(page),
    extractAPlus(page),
    extractItemDetails(page),
    extractRating(page),
    extractReviewCount(page),
    extractBSR(page),
    extractAvailability(page),
    extractSoldBy(page),
    extractFulfilledBy(page),
    extractDeliveryInfo(page),
    extractBreadcrumbs(page),
  ]);

  const asin = parseAsin(url);
  const measurements = parseMeasurements(productDetails);
  const weight = parseWeight(productDetails);

  const product = {
    // ── Core Identity
    asin,
    title,
    brand,
    productUrl: canonicalUrl(url),

    // ── Media
    imageUrls:  imageUrls?.length ? imageUrls : null,
    videoUrl,

    // ── Pricing
    price,
    currency:        currencyFor(locale),
    originalPrice,
    discountPercent,
    dealBadge,

    // ── Description & Content
    description:     featuresBullets ?? (description ? [description] : null),
    productDetails,
    itemDetails,
    featuresBullets,
    aPlus,

    // ── Specifications
    measurements,
    weight,
    style:            pickField(productDetails, 'Style', 'Colour', 'Color', 'Size'),
    material:         pickField(productDetails, 'Material', 'Material Type', 'Fabric', 'Material Composition'),
    careInstructions: pickField(productDetails, 'Care Instructions', 'Care instructions', 'Care Instruction'),

    // ── Categorisation
    category:         category?.length ? category : null,
    ageRange:         pickField(productDetails, 'Age Range', 'Recommended Age', 'Age range'),
    manufacturer:     pickField(productDetails, 'Manufacturer', 'Brand'),
    countryOfOrigin:  pickField(productDetails, 'Country of Origin', 'Country Of Origin'),

    // ── Ratings & Social Proof
    rating,
    reviewCount,
    bestSellerRank,

    // ── Logistics
    availability,
    soldBy,
    fulfilledBy,
    deliveryInfo,

    // ── Meta
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
