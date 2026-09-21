# Build scripts

This directory contains cross-platform deployment helpers.

To find the static-site build bridge that applies the Convex static-hosting CLI's selected deployment URL to Next.js visit [build-static.mjs](file:///C:/Hackathons/Parallex/scripts/build-static.mjs).

The Convex static-hosting connection can be found in [build-static.mjs](file:///C:/Hackathons/Parallex/scripts/build-static.mjs) and [package.json](file:///C:/Hackathons/Parallex/package.json).

## Architectural decisions

- The static-hosting CLI resolves the target Convex deployment before it invokes this script. The script maps its `VITE_CONVEX_URL` value to `NEXT_PUBLIC_CONVEX_URL` for Next.js, preventing an upload from bundling a different deployment URL from `.env.local`.
