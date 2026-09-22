# Settings route

This route group contains account-level settings.

To find the settings page mounting the OpenAI key form and global memory form visit [page.tsx](file:///C:/Hackathons/Parallex/src/app/settings/page.tsx).

The encrypted key storage connection can be found in [OpenAIKeyForm.tsx](file:///C:/Hackathons/Parallex/src/components/settings/OpenAIKeyForm.tsx) and [credentials.ts](file:///C:/Hackathons/Parallex/convex/credentials.ts). The global memory storage connection can be found in [GlobalMemoryForm.tsx](file:///C:/Hackathons/Parallex/src/components/settings/GlobalMemoryForm.tsx) and in [userProfiles.ts](file:///C:/Hackathons/Parallex/convex/userProfiles.ts).

## Architectural decisions

- The key form never receives the stored key back. It submits a replacement and displays only the configured state and a non-secret hint, so the full value exists solely inside Convex server scope.
- Global memory is versioned on save (superseding the previous version), which is what lets each run record exactly which instruction version influenced it.
