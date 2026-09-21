const SAFE_ERRORS: Record<string, string> = {
  NO_OPENAI_KEY: "Add your OpenAI API key in Settings before starting research.",
  NO_ZHIPU_KEY: "Add your Zhipu API key in Settings before starting research.",
  SUBMISSION_CONFLICT: "This request was already used for a different message.",
  EMAIL_ADDRESS_LIMIT:
    "Your account already has three email addresses. Assign an existing address to this bot.",
  INVALID_EMAIL_IDENTITY_SELECTION:
    "Choose an active email address owned by your account.",
  MISSION_TOO_LONG: "Mission must be 500 characters or fewer.",
  INVALID_AVATAR: "The avatar could not be validated.",
  UNSUPPORTED_RESEARCH_FILE: "That file type or size is not supported.",
  RUN_ACTIVE: "Wait for the active run to finish before deleting this chat.",
  OUTREACH_CONTEXT_INVALID:
    "This outreach draft is no longer linked to an active bot, chat, and email address.",
  OUTREACH_NOT_APPROVABLE: "This outreach draft cannot be approved in its current state.",
  INVALID_OUTREACH_DRAFT:
    "Outreach drafts need a valid recipient, subject, complete message, and constraints.",
  OUTREACH_IDEMPOTENCY_CONFLICT:
    "This outreach draft conflicts with another record. Start a new draft instead.",
  OUTREACH_NOT_FOUND: "This outreach draft no longer exists.",
};

export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  for (const [code, copy] of Object.entries(SAFE_ERRORS)) {
    if (message.includes(code)) return copy;
  }
  return "Something went wrong. Try again in a moment.";
}
