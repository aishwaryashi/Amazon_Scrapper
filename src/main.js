import { Actor } from 'apify';
import { PlaywrightCrawler, KeyValueStore } from 'crawlee';
import { router } from './routes.js';
import { parseAsin } from './utils.js';

await Actor.init();

// ─── Input ────────────────────────────────────────────────────────────────────

const input = await Actor.getInput();
const {
  categoryUrl,
  maxPages           = 5,
  maxProducts        = null,
  locale             = 'en-IN',
  proxyConfiguration: proxyConfig,
} = input ?? {};

if (!categoryUrl) {
  throw new Error('Input field "categoryUrl" is required.');
}

// ─── Proxy ────────────────────────────────────────────────────────────────────

const proxyConfiguration = proxyConfig
  ? await Actor.createProxyConfiguration(proxyConfig)
  : undefined;

// ─── Crawler ──────────────────────────────────────────────────────────────────

const crawler = new PlaywrightCrawler({
  proxyConfiguration,
  requestHandler: router,

  requestHandlerTimeoutSecs: 90,
  navigationTimeoutSecs:     45,
  maxConcurrency:            3,

  // Retry up to 3× so bot-blocked pages get fresh sessions + fingerprints
  maxRequestRetries: 3,

  // Rotate browser fingerprints (UA, viewport, platform, language) per session.
  // This is the primary anti-detection mechanism — do NOT set User-Agent manually
  // via setExtraHTTPHeaders, as Playwright ignores that header.
  browserPoolOptions: {
    useFingerprints: true,
    fingerprintOptions: {
      fingerprintGeneratorOptions: {
        browsers:  ['chrome'],
        devices:   ['desktop'],
        operatingSystems: ['windows', 'macos'],
        locales:   [locale],
      },
    },
  },

  launchContext: {
    launchOptions: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,900',
      ],
    },
  },

  // Set only the headers that fingerprint-generator does not control
  preNavigationHooks: [
    async ({ page, request }) => {
      const reqLocale = request.userData?.locale ?? locale;
      await page.setExtraHTTPHeaders({
        'Accept-Language':           `${reqLocale},en;q=0.9`,
        'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Encoding':           'gzip, deflate, br',
        'Cache-Control':             'no-cache',
        'Pragma':                    'no-cache',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest':            'document',
        'Sec-Fetch-Mode':            'navigate',
        'Sec-Fetch-Site':            'none',
      });

      // Hide automation signals that headless Chrome exposes
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        // Spoof plugins array (empty in headless Chrome, non-empty in real browsers)
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
        // Spoof languages
        Object.defineProperty(navigator, 'languages', { get: () => ['en-IN', 'en'] });
        // Remove the chrome.runtime automation flag
        if (window.chrome && window.chrome.runtime) {
          delete window.chrome.runtime.onConnect;
        }
      });
    },
  ],

  // Log every permanently-failed request and record its ASIN
  failedRequestHandler: async ({ request, log }) => {
    log.error(`[FAILED] ${request.url} — ${request.errorMessages?.at(-1) ?? 'unknown error'}`);
    const store = await KeyValueStore.open();
    const asin  = parseAsin(request.url);
    if (asin) {
      const list = (await store.getValue('failedAsins')) ?? [];
      if (!list.includes(asin)) {
        list.push(asin);
        await store.setValue('failedAsins', list);
      }
    }
  },
});

// ─── Run ──────────────────────────────────────────────────────────────────────

const store = await KeyValueStore.open();
await store.setValue('enqueuedCount', 0);
await store.setValue('failedAsins', []);

console.log(`Starting crawl — categoryUrl: ${categoryUrl}, maxPages: ${maxPages}, maxProducts: ${maxProducts ?? '∞'}, locale: ${locale}`);

await crawler.run([
  {
    url:      categoryUrl,
    label:    'LISTING',
    userData: { maxPages, maxProducts, locale, pageNum: 1 },
  },
]);

// ─── Summary ──────────────────────────────────────────────────────────────────

const failedAsins   = (await store.getValue('failedAsins')) ?? [];
const dataset       = await Actor.openDataset();
const { itemCount } = await dataset.getInfo();

console.log(`\nCrawl complete.`);
console.log(`  Products saved : ${itemCount}`);
console.log(`  Failed ASINs   : ${failedAsins.length ? failedAsins.join(', ') : 'none'}`);

if (failedAsins.length) {
  await Actor.setValue('OUTPUT_FAILED_ASINS', failedAsins);
}

await Actor.exit();
