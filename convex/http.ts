import { httpRouter } from "convex/server";

import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

// Add the AgentMail webhook route here.

export default http;
