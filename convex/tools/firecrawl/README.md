# Firecrawl handlers

This directory contains the fifteen bounded Firecrawl capability handlers. The handlers validate public URLs, reject unsafe interaction goals, persist canonical sources, and use durable polling for provider jobs.

To find shared Firecrawl normalization, source conversion, evidence limits, and polling setup visit [shared.ts](file:///C:/Hackathons/Parallex/convex/tools/firecrawl/shared.ts).

To find public URL, SSRF, provider format, timeout, and provider error handling visit [firecrawlClient.ts](file:///C:/Hackathons/Parallex/convex/lib/firecrawlClient.ts).

To find durable batch, crawl, extraction, and Agent polling visit [firecrawlJobPoller.ts](file:///C:/Hackathons/Parallex/convex/firecrawlJobPoller.ts) and [firecrawlJobs.ts](file:///C:/Hackathons/Parallex/convex/firecrawlJobs.ts).

The research source connection can be found in [sources.ts](file:///C:/Hackathons/Parallex/convex/sources.ts).

## Architectural decisions

- The browser never polls Firecrawl directly.
- Interact and Browser Research accept bounded public goals rather than arbitrary code.
- Provider job identifiers remain backend state and are not included in normalized research evidence.
- Canonical URLs and bounded excerpts connect provider output to report citations.
