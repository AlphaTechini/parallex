# Chat components

This directory contains the conversation experience: the layout shell, message rendering, composer with attachments and model selection, activity feed, run status, and report and email artifacts.

To find the component that composes chat state, the conversation sidebar, message list, and composer visit [ChatExperience.tsx](file:///C:/Hackathons/Parallex/src/components/chat/ChatExperience.tsx).

To find the collapsible, remembered conversation history rail visit [ChatSidebar.tsx](file:///C:/Hackathons/Parallex/src/components/chat/ChatSidebar.tsx).

To find the shared bot-scoped chat creation control visit [NewChatButton.tsx](file:///C:/Hackathons/Parallex/src/components/chat/NewChatButton.tsx).

To find the static route client that reads `chatId` from the query string before mounting the chat experience visit [ChatPageContent.tsx](file:///C:/Hackathons/Parallex/src/components/chat/ChatPageContent.tsx).

To find the submission composer with model and effort selectors, duplicate-safe submission identifiers, and the missing-key notice visit [Composer.tsx](file:///C:/Hackathons/Parallex/src/components/chat/Composer.tsx).

To find the owner-bound attachment upload flow visit [AttachmentPicker.tsx](file:///C:/Hackathons/Parallex/src/components/chat/AttachmentPicker.tsx).

To find message rendering, including email and schedule origin badges and the durable `✓✓` receipt visit [MessageRow.tsx](file:///C:/Hackathons/Parallex/src/components/chat/MessageRow.tsx).

To find sanitized Markdown rendering for assistant content visit [MarkdownMessage.tsx](file:///C:/Hackathons/Parallex/src/components/chat/MarkdownMessage.tsx).

To find the live research activity feed backed by run event records visit [ActivityFeed.tsx](file:///C:/Hackathons/Parallex/src/components/chat/ActivityFeed.tsx).

To find the active run banner with cancel visit [RunStatusBanner.tsx](file:///C:/Hackathons/Parallex/src/components/chat/RunStatusBanner.tsx).

To find report downloads, email status, and the failed email retry visit [RunArtifacts.tsx](file:///C:/Hackathons/Parallex/src/components/chat/RunArtifacts.tsx).

To find external outreach draft review and the authenticated first-send approval control visit [OutreachDrafts.tsx](file:///C:/Hackathons/Parallex/src/components/chat/OutreachDrafts.tsx).

The message persistence connection can be found in [Composer.tsx](file:///C:/Hackathons/Parallex/src/components/chat/Composer.tsx) and [messages.ts](file:///C:/Hackathons/Parallex/convex/messages.ts). The attachment upload connection can be found in [AttachmentPicker.tsx](file:///C:/Hackathons/Parallex/src/components/chat/AttachmentPicker.tsx) and [attachments.ts](file:///C:/Hackathons/Parallex/convex/attachments.ts). The run event connection can be found in [ActivityFeed.tsx](file:///C:/Hackathons/Parallex/src/components/chat/ActivityFeed.tsx) and [runEvents.ts](file:///C:/Hackathons/Parallex/convex/runEvents.ts). The report and email state connection can be found in [RunArtifacts.tsx](file:///C:/Hackathons/Parallex/src/components/chat/RunArtifacts.tsx), [reports.ts](file:///C:/Hackathons/Parallex/convex/reports.ts), and [emails.ts](file:///C:/Hackathons/Parallex/convex/emails.ts).

## Architectural decisions

- Statuses come from database records. The `✓✓` receipt means the server transaction persisted the message and durable run; activity badges reflect tool and email rows, so the UI cannot show success before the backend confirms it.
- Assistant Markdown is rendered through a sanitizing renderer with an http, https, and mailto URL allowlist, independent of server-side report sanitization.
- Attachment uploads use the same claim-token flow as avatars and reject unsupported types and sizes before submission, so rejected files never reach the research pipeline.
- The composer shows only models whose provider credential is active, applies provider-specific reasoning levels, and queues instead of blocking during an active run, matching the backend contract.
- Outreach drafts display the exact recipient, subject, body, and negotiation constraints. The model cannot turn a draft into a send; the approval button invokes the owner-checked mutation directly.
- Chat links use `/chats?chatId=...` rather than unbounded dynamic paths so the Next export can be hosted as static assets. The route value never authorizes access; `ChatExperience` receives only data returned by owner-checked Convex queries.
- Each research timeline appears directly below its triggering prompt and before the assistant result. Executing runs expand their activity and show cancellation; queued runs remain visually distinct, and terminal runs collapse by default without retaining a stop control. Provider reasoning summaries are not requested or rendered because token-level reasoning fragments obscure the actionable tool timeline.
- The compact composer stays at the bottom of the chat viewport. Smart follow tracks new messages and activity while the reader remains near the bottom, but does not pull the page away from older content after an intentional upward scroll.
- The desktop chat rail keeps new-chat and recent-conversation navigation visible. Its collapsed state is stored in browser-local storage so focus mode survives navigation and refresh without becoming account data.
