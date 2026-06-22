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

  // Allow enough time for lazy-loaded sections to render
  requestHandlerTimeoutSecs: 90,
  navigationTimeoutSecs:     45,

  // Conservative concurrency to stay under Amazon's rate limits
  maxConcurrency: 3,

  // Retry once before marking a request as failed
  maxRequestRetries: 1,

  launchContext: {
    launchOptions: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--window-size=1280,900',
      ],
    },
  },

  // Spoof realistic browser headers on every request
  preNavigationHooks: [
    async ({ page, request }) => {
      const reqLocale = request.userData?.locale ?? locale;
      await page.setExtraHTTPHeaders({
        'Accept-Language':          `${reqLocale},en;q=0.9`,
        'Accept':                   'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Encoding':          'gzip, deflate, br',
        'Cache-Control':            'no-cache',
        'Pragma':                   'no-cache',
        'Upgrade-Insecure-Requests':'1',
        'sec-ch-ua':                '"Chromium";v="124","Google Chrome";v="124","Not-A.Brand";v="99"',
        'sec-ch-ua-mobile':         '?0',
        'sec-ch-ua-platform':       '"Windows"',
        'Sec-Fetch-Dest':           'document',
        'Sec-Fetch-Mode':           'navigate',
        'Sec-Fetch-Site':           'none',
      });
    },
  ],

  // Log every failure and record the ASIN to failedAsins in the KV-store
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

// ─── Run ─────────────────────────────────────────────────────────────────────

// Initialise shared counter used by the LISTING handler
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

const failedAsins = (await store.getValue('failedAsins')) ?? [];
const dataset     = await Actor.openDataset();
const { itemCount } = await dataset.getInfo();

console.log(`\nCrawl complete.`);
console.log(`  Products saved : ${itemCount}`);
console.log(`  Failed ASINs   : ${failedAsins.length ? failedAsins.join(', ') : 'none'}`);

if (failedAsins.length) {
  // Persist failed ASINs as a named KV entry so they're visible in the Actor run output
  await Actor.setValue('OUTPUT_FAILED_ASINS', failedAsins);
}

await Actor.exit();
