/** Parse the 10-char ASIN out of any Amazon product URL. */
export function parseAsin(url) {
  const match = (url || '').match(/\/dp\/([A-Z0-9]{10})/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Strip currency symbols and thousands separators, return a float.
 * Returns null when the string contains no parseable number.
 */
export function parsePrice(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.]/g, '');
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Map locale strings to ISO 4217 currency codes. */
export function currencyFor(locale) {
  const MAP = {
    'en-IN': 'INR',
    'en-US': 'USD',
    'en-GB': 'GBP',
    'de-DE': 'EUR',
    'fr-FR': 'EUR',
    'es-ES': 'EUR',
    'it-IT': 'EUR',
    'ja-JP': 'JPY',
  };
  return MAP[locale] ?? 'INR';
}

/** Random async delay between minMs and maxMs milliseconds. */
export function randomDelay(minMs = 3000, maxMs = 6000) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reduce any Amazon product URL to its canonical form:
 *   https://www.amazon.<tld>/dp/<ASIN>
 * Falls back to the original URL when no ASIN is found.
 */
export function canonicalUrl(url) {
  try {
    const asin = parseAsin(url);
    if (!asin) return url;
    const { protocol, hostname } = new URL(url);
    return `${protocol}//${hostname}/dp/${asin}`;
  } catch {
    return url;
  }
}
