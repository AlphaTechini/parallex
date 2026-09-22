# Settings components

This directory contains account-level forms.

To find the OpenAI key form that saves, replaces, and deletes the encrypted credential and shows only the non-secret hint visit [OpenAIKeyForm.tsx](file:///C:/Hackathons/Parallex/src/components/settings/OpenAIKeyForm.tsx).

To find the global memory form with versioned saves visit [GlobalMemoryForm.tsx](file:///C:/Hackathons/Parallex/src/components/settings/GlobalMemoryForm.tsx).

The credential storage connection can be found in [OpenAIKeyForm.tsx](file:///C:/Hackathons/Parallex/src/components/settings/OpenAIKeyForm.tsx) and [credentials.ts](file:///C:/Hackathons/Parallex/convex/credentials.ts). The global memory connection can be found in [GlobalMemoryForm.tsx](file:///C:/Hackathons/Parallex/src/components/settings/GlobalMemoryForm.tsx) and [userProfiles.ts](file:///C:/Hackathons/Parallex/convex/userProfiles.ts).

## Architectural decisions

- The OpenAI key form is write-only from the client's perspective: the query surface returns configured state and a display hint, never the key, so no client path can leak the secret.
- Global memory saves create a new instruction version rather than overwriting, which preserves the per-run record of which instructions influenced historical research.
