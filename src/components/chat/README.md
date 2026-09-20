# Chat components

This directory contains the conversation experience: the layout shell, message rendering, composer with attachments and model selection, activity feed, run status, and report and email artifacts.

To find the component that composes chat state, the activity feed, message list, and composer visit [ChatExperience.tsx](file:///C:/Hackathons/Parallex/src/components/chat/ChatExperience.tsx).

To find the submission composer with model and effort selectors, duplicate-safe submission identifiers, and the missing-key notice visit [Composer.tsx](file:///C:/Hackathons/Parallex/src/components/chat/Composer.tsx).

To find the owner-bound attachment upload flow visit [AttachmentPicker.tsx](file:///C:/Hackathons/Parallex/src/components/chat/AttachmentPicker.tsx).

To find message rendering, including email and schedule origin badges and the receipt checkmark visit [MessageRow.tsx](file:///C:/Hackathons/Parallex/src/components/chat/MessageRow.tsx).

To find sanitized Markdown rendering for assistant content visit [MarkdownMessage.tsx](file:///C:/Hackathons/Parallex/src/components/chat/MarkdownMessage.tsx).

To find the live research activity feed backed by run event records visit [ActivityFeed.tsx](file:///C:/Hackathons/Parallex/src/components/chat/ActivityFeed.tsx).

To find the active run banner with cancel visit [RunStatusBanner.tsx](file:///C:/Hackathons/Parallex/src/components/chat/RunStatusBanner.tsx).

To find report downloads, email status, and the failed email retry visit [RunArtifacts.tsx](file:///C:/Hackathons/Parallex/src/components/chat/RunArtifacts.tsx).

The message persistence connection can be found in [Composer.tsx](file:///C:/Hackathons/Parallex/src/components/chat/Composer.tsx) and [messages.ts](file:///C:/Hackathons/Parallex/convex/messages.ts). The attachment upload connection can be found in [AttachmentPicker.tsx](file:///C:/Hackathons/Parallex/src/components/chat/AttachmentPicker.tsx) and [attachments.ts](file:///C:/Hackathons/Parallex/convex/attachments.ts). The run event connection can be found in [ActivityFeed.tsx](file:///C:/Hackathons/Parallex/src/components/chat/ActivityFeed.tsx) and [runEvents.ts](file:///C:/Hackathons/Parallex/convex/runEvents.ts). The report and email state connection can be found in [RunArtifacts.tsx](file:///C:/Hackathons/Parallex/src/components/chat/RunArtifacts.tsx), [reports.ts](file:///C:/Hackathons/Parallex/convex/reports.ts), and [emails.ts](file:///C:/Hackathons/Parallex/convex/emails.ts).

## Architectural decisions

- Statuses come from database records. The receipt checkmark means the server persisted the message; activity badges reflect tool and email rows, so the UI cannot show success before the backend confirms it.
- Assistant Markdown is rendered through a sanitizing renderer with an http, https, and mailto URL allowlist, independent of server-side report sanitization.
- Attachment uploads use the same claim-token flow as avatars and reject unsupported types and sizes before submission, so rejected files never reach the research pipeline.
- The composer shows only models whose provider credential is active, applies provider-specific reasoning levels, and queues instead of blocking during an active run, matching the backend contract.
- The activity feed is collapsible, expanded by default while a run is live and collapsed after completion, which keeps finished answers prominent without hiding the audit trail.
