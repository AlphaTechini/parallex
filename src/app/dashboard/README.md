# Dashboard route

This route group contains the bot dashboard, the first screen after sign-in.

To find the dashboard page with the empty state, bot grid, email-address filter, and profile initialization visit [page.tsx](file:///C:/Hackathons/Parallex/src/app/dashboard/page.tsx).

The bot listing connection can be found in [bots.ts](file:///C:/Hackathons/Parallex/convex/bots.ts) and in [BotCard.tsx](file:///C:/Hackathons/Parallex/src/components/bots/BotCard.tsx). The first sign-in profile initialization connection can be found in [userProfiles.ts](file:///C:/Hackathons/Parallex/convex/userProfiles.ts).

## Architectural decisions

- A new account sees an explicit empty state with a create action instead of a generated default bot, because bot identity, recipient email, and inbox provisioning are user decisions.
- The dashboard triggers `ensureProfile` on mount so account-level settings exist before any bot creation, without a separate onboarding screen.
- The dashboard renders presentation data only (name, mission, email capability, avatar); provider identifiers and secrets are never exposed here.
- Email filtering uses the confirmed public address already returned in each bot summary. Provider inbox identifiers remain server-only.
