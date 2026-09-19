import { httpRouter } from "convex/server";

import { auth } from "./auth";
import { httpAction } from "./_generated/server";
import { handleAgentMailWebhook } from "./webhooks";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/agentmail/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => handleAgentMailWebhook(ctx, request)),
});

export default http;
