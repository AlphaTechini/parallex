const SAFE_ERRORS: Record<string, string> = {
  NO_OPENAI_KEY: "Add your OpenAI API key in Settings before starting research.",
  NO_ZHIPU_KEY: "Add your Zhipu API key in Settings before starting research.",
  SUBMISSION_CONFLICT: "This request was already used for a different message.",
  EMAIL_BOT_LIMIT: "The demo supports up to three email-enabled bots.",
  MISSION_TOO_LONG: "Mission must be 500 characters or fewer.",
  INVALID_AVATAR: "The avatar could not be validated.",
  UNSUPPORTED_RESEARCH_FILE: "That file type or size is not supported.",
  RUN_ACTIVE: "Wait for the active run to finish before deleting this chat.",
};

export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  for (const [code, copy] of Object.entries(SAFE_ERRORS)) {
    if (message.includes(code)) return copy;
  }
  return "Something went wrong. Try again in a moment.";
}
