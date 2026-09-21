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
import type * as emails from "../emails.js";
import type * as firecrawlJobPoller from "../firecrawlJobPoller.js";
import type * as firecrawlJobs from "../firecrawlJobs.js";
import type * as http from "../http.js";
import type * as inboundEmailProcessor from "../inboundEmailProcessor.js";
import type * as inboxes from "../inboxes.js";
import type * as lib_agentmailClient from "../lib/agentmailClient.js";
import type * as lib_authHelpers from "../lib/authHelpers.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_firecrawlClient from "../lib/firecrawlClient.js";
import type * as lib_models from "../lib/models.js";
import type * as lib_normalize from "../lib/normalize.js";
import type * as lib_openaiClient from "../lib/openaiClient.js";
import type * as lib_providerCredentials from "../lib/providerCredentials.js";
import type * as lib_providerPrompt from "../lib/providerPrompt.js";
import type * as lib_recurrence from "../lib/recurrence.js";
import type * as lib_runGraph from "../lib/runGraph.js";
import type * as lib_runScheduling from "../lib/runScheduling.js";
import type * as lib_stageMap from "../lib/stageMap.js";
import type * as lib_toolCallPersistence from "../lib/toolCallPersistence.js";
import type * as lib_zhipuClient from "../lib/zhipuClient.js";
import type * as messages from "../messages.js";
import type * as prompts_researchProtocol from "../prompts/researchProtocol.js";
import type * as reports from "../reports.js";
import type * as routeIds from "../routeIds.js";
import type * as runEvents from "../runEvents.js";
import type * as runs from "../runs.js";
import type * as scheduleOccurrenceWorker from "../scheduleOccurrenceWorker.js";
import type * as schedules from "../schedules.js";
import type * as sources from "../sources.js";
import type * as staticSite from "../staticSite.js";
import type * as tools_createResearchSchedule from "../tools/createResearchSchedule.js";
import type * as tools_definitions from "../tools/definitions.js";
import type * as tools_firecrawl_agentGather from "../tools/firecrawl/agentGather.js";
import type * as tools_firecrawl_batchScrape from "../tools/firecrawl/batchScrape.js";
import type * as tools_firecrawl_browserResearch from "../tools/firecrawl/browserResearch.js";
import type * as tools_firecrawl_comparePageChange from "../tools/firecrawl/comparePageChange.js";
import type * as tools_firecrawl_crawlSite from "../tools/firecrawl/crawlSite.js";
import type * as tools_firecrawl_extractMedia from "../tools/firecrawl/extractMedia.js";
import type * as tools_firecrawl_extractStructured from "../tools/firecrawl/extractStructured.js";
import type * as tools_firecrawl_interactPage from "../tools/firecrawl/interactPage.js";
import type * as tools_firecrawl_mapSite from "../tools/firecrawl/mapSite.js";
import type * as tools_firecrawl_outputBudget from "../tools/firecrawl/outputBudget.js";
import type * as tools_firecrawl_parseDocument from "../tools/firecrawl/parseDocument.js";
import type * as tools_firecrawl_queryPage from "../tools/firecrawl/queryPage.js";
import type * as tools_firecrawl_scrapePage from "../tools/firecrawl/scrapePage.js";
import type * as tools_firecrawl_searchDeveloper from "../tools/firecrawl/searchDeveloper.js";
import type * as tools_firecrawl_searchResearch from "../tools/firecrawl/searchResearch.js";
import type * as tools_firecrawl_searchWeb from "../tools/firecrawl/searchWeb.js";
import type * as tools_firecrawl_shared from "../tools/firecrawl/shared.js";
import type * as tools_listStoredReports from "../tools/listStoredReports.js";
import type * as tools_publishReport from "../tools/publishReport.js";
import type * as tools_readStoredReport from "../tools/readStoredReport.js";
import type * as tools_registry from "../tools/registry.js";
import type * as tools_sendResearchEmail from "../tools/sendResearchEmail.js";
import type * as tools_types from "../tools/types.js";
import type * as tools_updateChatTitle from "../tools/updateChatTitle.js";
import type * as userProfiles from "../userProfiles.js";
import type * as webhooks from "../webhooks.js";
import type * as workers_emailSender from "../workers/emailSender.js";
import type * as workers_inboxProvisioner from "../workers/inboxProvisioner.js";
import type * as workers_runMutations from "../workers/runMutations.js";
import type * as workers_runWorker from "../workers/runWorker.js";
import type * as workers_streamConsumer from "../workers/streamConsumer.js";
import type * as workers_toolExecutor from "../workers/toolExecutor.js";
import type * as workers_zhipuRunMutations from "../workers/zhipuRunMutations.js";
import type * as workers_zhipuRunWorker from "../workers/zhipuRunWorker.js";

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
  emails: typeof emails;
  firecrawlJobPoller: typeof firecrawlJobPoller;
  firecrawlJobs: typeof firecrawlJobs;
  http: typeof http;
  inboundEmailProcessor: typeof inboundEmailProcessor;
  inboxes: typeof inboxes;
  "lib/agentmailClient": typeof lib_agentmailClient;
  "lib/authHelpers": typeof lib_authHelpers;
  "lib/crypto": typeof lib_crypto;
  "lib/firecrawlClient": typeof lib_firecrawlClient;
  "lib/models": typeof lib_models;
  "lib/normalize": typeof lib_normalize;
  "lib/openaiClient": typeof lib_openaiClient;
  "lib/providerCredentials": typeof lib_providerCredentials;
  "lib/providerPrompt": typeof lib_providerPrompt;
  "lib/recurrence": typeof lib_recurrence;
  "lib/runGraph": typeof lib_runGraph;
  "lib/runScheduling": typeof lib_runScheduling;
  "lib/stageMap": typeof lib_stageMap;
  "lib/toolCallPersistence": typeof lib_toolCallPersistence;
  "lib/zhipuClient": typeof lib_zhipuClient;
  messages: typeof messages;
  "prompts/researchProtocol": typeof prompts_researchProtocol;
  reports: typeof reports;
  routeIds: typeof routeIds;
  runEvents: typeof runEvents;
  runs: typeof runs;
  scheduleOccurrenceWorker: typeof scheduleOccurrenceWorker;
  schedules: typeof schedules;
  sources: typeof sources;
  staticSite: typeof staticSite;
  "tools/createResearchSchedule": typeof tools_createResearchSchedule;
  "tools/definitions": typeof tools_definitions;
  "tools/firecrawl/agentGather": typeof tools_firecrawl_agentGather;
  "tools/firecrawl/batchScrape": typeof tools_firecrawl_batchScrape;
  "tools/firecrawl/browserResearch": typeof tools_firecrawl_browserResearch;
  "tools/firecrawl/comparePageChange": typeof tools_firecrawl_comparePageChange;
  "tools/firecrawl/crawlSite": typeof tools_firecrawl_crawlSite;
  "tools/firecrawl/extractMedia": typeof tools_firecrawl_extractMedia;
  "tools/firecrawl/extractStructured": typeof tools_firecrawl_extractStructured;
  "tools/firecrawl/interactPage": typeof tools_firecrawl_interactPage;
  "tools/firecrawl/mapSite": typeof tools_firecrawl_mapSite;
  "tools/firecrawl/outputBudget": typeof tools_firecrawl_outputBudget;
  "tools/firecrawl/parseDocument": typeof tools_firecrawl_parseDocument;
  "tools/firecrawl/queryPage": typeof tools_firecrawl_queryPage;
  "tools/firecrawl/scrapePage": typeof tools_firecrawl_scrapePage;
  "tools/firecrawl/searchDeveloper": typeof tools_firecrawl_searchDeveloper;
  "tools/firecrawl/searchResearch": typeof tools_firecrawl_searchResearch;
  "tools/firecrawl/searchWeb": typeof tools_firecrawl_searchWeb;
  "tools/firecrawl/shared": typeof tools_firecrawl_shared;
  "tools/listStoredReports": typeof tools_listStoredReports;
  "tools/publishReport": typeof tools_publishReport;
  "tools/readStoredReport": typeof tools_readStoredReport;
  "tools/registry": typeof tools_registry;
  "tools/sendResearchEmail": typeof tools_sendResearchEmail;
  "tools/types": typeof tools_types;
  "tools/updateChatTitle": typeof tools_updateChatTitle;
  userProfiles: typeof userProfiles;
  webhooks: typeof webhooks;
  "workers/emailSender": typeof workers_emailSender;
  "workers/inboxProvisioner": typeof workers_inboxProvisioner;
  "workers/runMutations": typeof workers_runMutations;
  "workers/runWorker": typeof workers_runWorker;
  "workers/streamConsumer": typeof workers_streamConsumer;
  "workers/toolExecutor": typeof workers_toolExecutor;
  "workers/zhipuRunMutations": typeof workers_zhipuRunMutations;
  "workers/zhipuRunWorker": typeof workers_zhipuRunWorker;
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

export declare const components: {
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
};
