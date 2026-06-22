# Graph Report - Amazon_Scrapper  (2026-06-22)

## Corpus Check
- 9 files · ~4,460 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 145 nodes · 197 edges · 14 communities (13 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a94e7497`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]

## God Nodes (most connected - your core abstractions)
1. `tryText()` - 12 edges
2. `maxPages` - 7 edges
3. `locale` - 7 edges
4. `proxyConfiguration` - 6 edges
5. `categoryUrl` - 5 edges
6. `maxProducts` - 5 edges
7. `tryTextAll()` - 5 edges
8. `parseAsin()` - 5 edges
9. `overview` - 4 edges
10. `extractPrice()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `_logFailedAsin()` --calls--> `parseAsin()`  [EXTRACTED]
  src/routes.js → src/utils.js
- `extractPrice()` --calls--> `parsePrice()`  [EXTRACTED]
  src/extractors.js → src/utils.js
- `extractOriginalPrice()` --calls--> `parsePrice()`  [EXTRACTED]
  src/extractors.js → src/utils.js

## Communities (14 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.11
Nodes (18): description, editor, title, type, default, description, maximum, minimum (+10 more)

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (15): actorSpecification, buildTag, actorSpecification, views, dockerfile, input, name, title (+7 more)

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (14): dependencies, apify, crawlee, playwright, description, engines, node, main (+6 more)

### Community 3 - "Community 3"
Cohesion: 0.14
Nodes (14): component, properties, display, asin, availability, brand, currency, discountPercent (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.15
Nodes (16): extractAPlus(), extractBreadcrumbs(), extractBSR(), extractDescription(), extractFeatureBullets(), extractFulfilledBy(), extractImages(), extractImportantInfo() (+8 more)

### Community 5 - "Community 5"
Cohesion: 0.20
Nodes (10): extractAvailability(), extractBrand(), extractDealBadge(), extractDeliveryInfo(), extractDiscountPercent(), extractRating(), extractReviewCount(), extractSoldBy() (+2 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (15): a, allLinks, anchor, asin, btn, containers, grid, isBestsellers (+7 more)

### Community 7 - "Community 7"
Cohesion: 0.28
Nodes (7): crawler, _logFailedAsin(), router, canonicalUrl(), currencyFor(), parseAsin(), randomDelay()

### Community 8 - "Community 8"
Cohesion: 0.25
Nodes (8): apifyProxyGroups, useApifyProxy, proxyConfiguration, description, editor, prefill, title, type

### Community 9 - "Community 9"
Cohesion: 0.29
Nodes (6): actorInputSchemaVersion, description, required, schemaVersion, title, type

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (7): default, description, enum, enumTitles, title, type, locale

### Community 11 - "Community 11"
Cohesion: 0.67
Nodes (3): extractOriginalPrice(), extractPrice(), parsePrice()

## Knowledge Gaps
- **81 isolated node(s):** `name`, `version`, `type`, `description`, `main` (+76 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `properties` connect `Community 0` to `Community 8`, `Community 9`, `Community 10`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `overview` connect `Community 1` to `Community 3`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `name`, `version`, `type` to the rest of the system?**
  _81 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._