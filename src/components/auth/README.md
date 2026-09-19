# Auth components

This folder is a reserved boundary for authentication interface components. It currently contains no code.

To find the current sign-in and sign-up implementation visit [../signin/page.tsx](file:///C:/Hackathons/Parallex/src/app/signin/page.tsx). The working sign-in and sign-up interface lives in the sign-in route, and the auth provider wiring lives in [../../app/providers.tsx](file:///C:/Hackathons/Parallex/src/app/providers.tsx). The backend connection can be found in [auth.ts](file:///C:/Hackathons/Parallex/convex/auth.ts).

## Architectural decisions

- Auth UI stays in one route rather than spreading Convex Auth calls through product components, which keeps the beta auth library behind a small boundary that is easy to swap or upgrade.
- This folder exists so future shared auth surfaces (session widgets, verification states) have a designated home instead of growing inside product categories.
