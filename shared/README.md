# Shared contracts

This directory contains runtime-neutral contracts used by both the Next.js client and Convex backend.

To find the comprehensive user-intake, evaluation, pricing, evidence, ranking, and output framework applied to built-in and generated bot templates visit [templateFramework.ts](file:///C:/Hackathons/Parallex/shared/templateFramework.ts).

The template memory compilation connection can be found in [templateFramework.ts](file:///C:/Hackathons/Parallex/convex/lib/templateFramework.ts), while built-in template composition can be found in [templateCatalog.ts](file:///C:/Hackathons/Parallex/src/components/templates/templateCatalog.ts).

## Architectural decisions

- Shared files contain no runtime-specific imports, secrets, database access, or browser globals.
- One exported framework keeps built-in and generated templates aligned without maintaining duplicate pricing and decision-quality instructions.
