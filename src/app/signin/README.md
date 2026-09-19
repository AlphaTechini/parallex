# Sign-in route

This route group contains the public authentication page.

To find the sign-in and sign-up page with the email and password form visit [page.tsx](file:///C:/Hackathons/Parallex/src/app/signin/page.tsx).

The authentication backend connection can be found in [auth.ts](file:///C:/Hackathons/Parallex/convex/auth.ts) and [auth.config.ts](file:///C:/Hackathons/Parallex/convex/auth.config.ts). The provider wiring connection can be found in [providers.tsx](file:///C:/Hackathons/Parallex/src/app/providers.tsx).

## Architectural decisions

- The page renders a configuration state instead of evaluating auth hooks when `NEXT_PUBLIC_CONVEX_URL` is absent, so the app builds and boots cleanly before Convex provisioning.
- A single form toggles between sign-in and sign-up flows through Convex Auth's password provider; no second password store or verification flow exists in application code.
- The route is public by proxy matcher rule; signed-in visitors are redirected to the dashboard.
