# Convex backend scaffold

This directory contains the initial Convex Auth wiring and an empty application schema. The backend-core worker owns the application tables and server features that will replace the empty table object.

The authentication boundary can be found in [auth.ts](file:///C:/Hackathons/Parallex/convex/auth.ts). The authentication provider configuration can be found in [auth.config.ts](file:///C:/Hackathons/Parallex/convex/auth.config.ts). HTTP route registration can be found in [http.ts](file:///C:/Hackathons/Parallex/convex/http.ts). The initial schema boundary can be found in [schema.ts](file:///C:/Hackathons/Parallex/convex/schema.ts). Convex compiler settings can be found in [tsconfig.json](file:///C:/Hackathons/Parallex/convex/tsconfig.json).

The Convex database and authentication connection can be found in [auth.ts](file:///C:/Hackathons/Parallex/convex/auth.ts), [auth.config.ts](file:///C:/Hackathons/Parallex/convex/auth.config.ts), and [http.ts](file:///C:/Hackathons/Parallex/convex/http.ts).

## Next 16 + Convex Auth spike

The pinned `@convex-dev/auth@0.0.95` package does not export `@convex-dev/auth/nextjs/client`. The working client provider export is `ConvexAuthNextjsProvider` from `@convex-dev/auth/nextjs`, used by [providers.tsx](file:///C:/Hackathons/Parallex/src/app/providers.tsx).

Next 16 uses the `proxy.ts` file convention. The compatibility implementation is in [proxy.ts](file:///C:/Hackathons/Parallex/src/proxy.ts) and uses `convexAuthNextjsMiddleware()` with the documented static matcher. `pnpm build` recognized the file as `Proxy (Middleware)` and completed successfully, so no `middleware.ts` fallback was needed.

The build can run before a Convex deployment is provisioned. [providers.tsx](file:///C:/Hackathons/Parallex/src/app/providers.tsx) leaves the provider unmounted when `NEXT_PUBLIC_CONVEX_URL` is absent, and [signin/page.tsx](file:///C:/Hackathons/Parallex/src/app/signin/page.tsx) shows a configuration state instead of evaluating auth hooks. The user must run `pnpm convex:dev` once and provide the generated environment values before using authentication.

Convex Auth exports `authTables` as a named export in the pinned package, so [schema.ts](file:///C:/Hackathons/Parallex/convex/schema.ts) uses the named import. The package requires an `@auth/core` peer in the `0.41.x` range. The docs reference `0.41.1`, but the root manifest pins patched `0.41.3` after the audit identified vulnerabilities in `0.41.1`.

The generated Convex API and data model files are intentionally absent until the user runs `pnpm convex:dev` once with an authenticated Convex account.
