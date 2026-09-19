/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as attachments from "../attachments.js";
import type * as auth from "../auth.js";
import type * as bots from "../bots.js";
import type * as chats from "../chats.js";
import type * as credentials from "../credentials.js";
import type * as http from "../http.js";
import type * as inboxes from "../inboxes.js";
import type * as lib_agentmailClient from "../lib/agentmailClient.js";
import type * as lib_authHelpers from "../lib/authHelpers.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_models from "../lib/models.js";
import type * as lib_normalize from "../lib/normalize.js";
import type * as lib_openaiClient from "../lib/openaiClient.js";
import type * as lib_stageMap from "../lib/stageMap.js";
import type * as messages from "../messages.js";
import type * as prompts_researchProtocol from "../prompts/researchProtocol.js";
import type * as runEvents from "../runEvents.js";
import type * as runs from "../runs.js";
import type * as tools_definitions from "../tools/definitions.js";
import type * as userProfiles from "../userProfiles.js";
import type * as workers_inboxProvisioner from "../workers/inboxProvisioner.js";
import type * as workers_runMutations from "../workers/runMutations.js";
import type * as workers_runWorker from "../workers/runWorker.js";
import type * as workers_streamConsumer from "../workers/streamConsumer.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  attachments: typeof attachments;
  auth: typeof auth;
  bots: typeof bots;
  chats: typeof chats;
  credentials: typeof credentials;
  http: typeof http;
  inboxes: typeof inboxes;
  "lib/agentmailClient": typeof lib_agentmailClient;
  "lib/authHelpers": typeof lib_authHelpers;
  "lib/crypto": typeof lib_crypto;
  "lib/models": typeof lib_models;
  "lib/normalize": typeof lib_normalize;
  "lib/openaiClient": typeof lib_openaiClient;
  "lib/stageMap": typeof lib_stageMap;
  messages: typeof messages;
  "prompts/researchProtocol": typeof prompts_researchProtocol;
  runEvents: typeof runEvents;
  runs: typeof runs;
  "tools/definitions": typeof tools_definitions;
  userProfiles: typeof userProfiles;
  "workers/inboxProvisioner": typeof workers_inboxProvisioner;
  "workers/runMutations": typeof workers_runMutations;
  "workers/runWorker": typeof workers_runWorker;
  "workers/streamConsumer": typeof workers_streamConsumer;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
