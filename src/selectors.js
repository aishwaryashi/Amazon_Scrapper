/**
 * CSS selectors for Amazon listing (SERP) pages and product detail pages (PDP).
 *
 * Arrays indicate fallback chains — the extractor tries each selector in order
 * and returns the first non-empty result.
 */

export const LISTING = {
  // ── Standard search / category SERP  (/s?... or /s/...)
  productCard: '[data-component-type="s-search-result"][data-asin]:not([data-asin=""])',
  productLink:  'h2 > a.a-link-normal',
  nextPage:     'a.s-pagination-next:not([aria-disabled="true"]):not(.s-pagination-disabled)',

  // ── Bestsellers / zgbs  (/gp/bestsellers/... or /zgbs/...)
  // Each <li class="zg-item-immersion"> contains several <a> tags for the same product;
  // we deduplicate by canonical /dp/ URL in the route handler.
  bsRoot:     '#zg-ordered-list li, #gridItemRoot li, .zg-item-immersion',
  bsLink:     '.zg-item-immersion a.a-link-normal[href*="/dp/"]',
  bsNextPage: 'ul.a-pagination .a-last a',
};

export const PDP = {
  // ── Core Identity ──────────────────────────────────────────────────────────
  title: '#productTitle',

  // "Visit the Babique Store" / "Brand: Babique" / plain byline text
  brand: [
    'a#bylineInfo',
    '#bylineInfo',
    '.po-brand .po-break-word',
    'tr.po-brand td span',
  ],

  // ── Pricing ────────────────────────────────────────────────────────────────
  // Amazon India (2024-2026) uses #corePrice_feature_div with .priceToPay.
  // Older / alternate layouts use #corePriceDisplay_desktop_feature_div.
  price: [
    // Modern Amazon IN layout (corePrice block, priceToPay span)
    '#corePrice_feature_div .priceToPay .a-offscreen',
    '#corePrice_feature_div .a-price:not(.a-text-price) .a-offscreen',
    // Reinvented / apex price blocks
    '#apex_desktop .reinventPricePriceToPayMargin .a-offscreen',
    '#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen',
    '#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen',
    '.apexPriceToPay .a-offscreen',
    // Legacy blocks
    '#priceblock_ourprice',
    '#priceblock_dealprice',
    '#price_inside_buybox',
    '#kindle-price',
  ],

  // "M.R.P.: ₹209" — the secondary a-text-price element in the same price block
  originalPrice: [
    '#corePrice_feature_div .a-text-price .a-offscreen',
    '#corePriceDisplay_desktop_feature_div .basisPrice .a-offscreen',
    '.basisPrice .a-offscreen',
    '#corePriceDisplay_desktop_feature_div .a-text-price .a-offscreen',
  ],

  discountPercent: [
    '#corePrice_feature_div .savingPriceOverride',
    '#corePriceDisplay_desktop_feature_div .savingPriceOverride',
    '#apex_desktop .savingPriceOverride',
    '.reinventPriceBlockText .savingPriceOverride',
  ],

  dealBadge: [
    '#dealBadge_feature_div .label',
    '#dealBadge_feature_div .a-badge-label-inner span',
    '.promoPriceBlockMessage .a-color-price',
    '.dealLabel',
    '#couponBadgeRegularVpc .s-coupon-highlight-color',
  ],

  // ── Media ─────────────────────────────────────────────────────────────────
  mainImageFallback: '#landingImage, #imgBlkFront',
  altImages:         '#altImages .a-button-thumbnail img, #imageBlockThumbs img',

  // ── Description & Content ─────────────────────────────────────────────────
  featureBullets: '#feature-bullets li:not(.aok-hidden) > span.a-list-item',
  description:    ['#productDescription p', '#productDescription span:not(.a-text-bold)'],
  aplus:          ['#aplus .aplus-module-wrapper', '#aplus3p_feature_div .aplus-module-wrapper'],

  // ── Product Details / Specs ───────────────────────────────────────────────
  techSpecRows:    [
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

  // Tabular buy-box (Amazon IN toys / most modern PDPs):
  //   <div tabular-attribute-name="Sold by"><div class="tabular-buybox-text"><a>SellerName</a>
  // Fallback: legacy #merchant-info / #sellerProfileTriggerId
  soldBy: [
    '#tabular-buybox [tabular-attribute-name="Sold by"] .tabular-buybox-text',
    '#sellerProfileTriggerId',
    '#merchant-info a',
  ],

  // "Ships from" column in the same tabular buy-box indicates fulfillment source
  fulfilledBy: [
    '#tabular-buybox [tabular-attribute-name="Ships from"] .tabular-buybox-text',
    '#fulfilledByThirdParty',
    '#merchant-info',
  ],

  deliveryInfo: [
    // Modern delivery block (slot-based)
    '#mir-layout-DELIVERY_BLOCK-slot-DELIVERY_MESSAGE',
    // Older delivery blocks
    '#deliveryBlockMessage',
    '#ddmDeliveryMessage',
    '#ssoChangeAddressLink',
  ],

  // ── Breadcrumb ────────────────────────────────────────────────────────────
  breadcrumbs: '#wayfinding-breadcrumbs_feature_div li',

  // ── User Guide ────────────────────────────────────────────────────────────
  // Some products expose a downloadable PDF guide in this feature div.
  userGuide: '#user-guide_feature_div a[href]',

  // ── Important / Safety information ───────────────────────────────────────
  importantInfo: '#important-information .a-section, #important_information .a-section',

  // ── Expanders (lazy-loaded accordion sections) ────────────────────────────
  expanders: '.a-expander-prompt, [data-action="a-expander-toggle"]',
};
