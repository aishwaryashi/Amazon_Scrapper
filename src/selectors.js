/**
 * CSS selectors for Amazon listing (SERP) pages and product detail pages (PDP).
 *
 * Arrays indicate fallback chains — the extractor tries each selector in order
 * and returns the first non-empty result.
 */

export const LISTING = {
  productCard: '[data-component-type="s-search-result"][data-asin]:not([data-asin=""])',
  productLink:  'h2 > a.a-link-normal',
  nextPage:     'a.s-pagination-next:not([aria-disabled="true"]):not(.s-pagination-disabled)',
};

export const PDP = {
  // ── Core Identity ──────────────────────────────────────────────────────────
  title: '#productTitle',
  brand: [
    'a#bylineInfo',
    '#bylineInfo',
    '.po-brand .po-break-word',
    'tr.po-brand td span',
  ],

  // ── Pricing ────────────────────────────────────────────────────────────────
  price: [
    // Reinvented price block (most IN pages)
    '#apex_desktop .reinventPricePriceToPayMargin .a-offscreen',
    // Core price display block
    '#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen',
    // Apex price to pay
    '.apexPriceToPay .a-offscreen',
    // Legacy blocks
    '#priceblock_ourprice',
    '#priceblock_dealprice',
    '#price_inside_buybox',
    '#kindle-price',
  ],
  originalPrice: [
    '#corePriceDisplay_desktop_feature_div .basisPrice .a-offscreen',
    '.basisPrice .a-offscreen',
    '#corePriceDisplay_desktop_feature_div .a-text-price .a-offscreen',
    '.a-text-price .a-offscreen',
  ],
  discountPercent: [
    '#corePriceDisplay_desktop_feature_div .savingPriceOverride',
    '#apex_desktop .savingPriceOverride',
    '.reinventPriceBlockText .savingPriceOverride',
  ],
  dealBadge: [
    '#dealBadge_feature_div .label',
    '#dealBadge_feature_div .a-badge-label-inner span',
    '.promoPriceBlockMessage .a-color-price',
    '.dealLabel',
  ],

  // ── Media ─────────────────────────────────────────────────────────────────
  // Images are best parsed from the colorImages JSON in a <script> tag.
  // These selectors are fallbacks when the script-tag approach fails.
  mainImageFallback: '#landingImage, #imgBlkFront',
  altImages:         '#altImages .a-button-thumbnail img, #imageBlockThumbs img',

  // ── Description & Content ─────────────────────────────────────────────────
  featureBullets:  '#feature-bullets li:not(.aok-hidden) > span.a-list-item',
  description:     ['#productDescription p', '#productDescription span:not(.a-text-bold)'],
  aplus:           ['#aplus .aplus-module-wrapper', '#aplus3p_feature_div .aplus-module-wrapper'],

  // ── Product Details / Specs ───────────────────────────────────────────────
  techSpecRows:   [
    '#productDetails_techSpec_section_1 tr',
    '#productDetails_techSpec_section_2 tr',
  ],
  detailBullets:   '#detailBulletsWrapper_feature_div ul li, #detailBullets li',
  itemDetailsRows: '#productDetails_db_sections tr',

  // ── Ratings & Social Proof ────────────────────────────────────────────────
  rating: [
    '#acrPopover .a-icon-alt',
    '[data-hook="rating-out-of-text"]',
    '#averageCustomerReviews .a-icon-alt',
  ],
  reviewCount: [
    '#acrCustomerReviewText',
    '[data-hook="total-review-count"]',
  ],

  // ── Logistics ─────────────────────────────────────────────────────────────
  availability: '#availability > span',
  soldBy:       ['#sellerProfileTriggerId', '#merchant-info a'],
  fulfilledBy:  '#fulfilledByThirdParty, #merchant-info',
  deliveryInfo: [
    '#mir-layout-DELIVERY_BLOCK-slot-DELIVERY_MESSAGE .a-text-bold',
    '#deliveryBlockMessage .a-text-bold',
    '#ddmDeliveryMessage .a-text-bold',
    '#ssoChangeAddressLink',
  ],

  // ── Breadcrumb ────────────────────────────────────────────────────────────
  breadcrumbs: '#wayfinding-breadcrumbs_feature_div li',

  // ── Expanders (lazy-loaded accordion sections) ────────────────────────────
  expanders: '.a-expander-prompt, [data-action="a-expander-toggle"]',
};
