"use node";

import type { ToolFunctionName } from "./definitions";
import type { ExecutorResult, ToolExecutionContext } from "./types";
import { execute as searchWeb } from "./firecrawl/searchWeb";
import { execute as searchResearch } from "./firecrawl/searchResearch";
import { execute as searchDeveloper } from "./firecrawl/searchDeveloper";
import { execute as mapSite } from "./firecrawl/mapSite";
import { execute as scrapePage } from "./firecrawl/scrapePage";
import { execute as batchScrape } from "./firecrawl/batchScrape";
import { execute as crawlSite } from "./firecrawl/crawlSite";
import { execute as parseDocument } from "./firecrawl/parseDocument";
import { execute as extractStructured } from "./firecrawl/extractStructured";
import { execute as queryPage } from "./firecrawl/queryPage";
import { execute as interactPage } from "./firecrawl/interactPage";
import { execute as browserResearch } from "./firecrawl/browserResearch";
import { execute as extractMedia } from "./firecrawl/extractMedia";
import { execute as comparePageChange } from "./firecrawl/comparePageChange";
import { execute as agentGather } from "./firecrawl/agentGather";
import { execute as listStoredReports } from "./listStoredReports";
import { execute as readStoredReport } from "./readStoredReport";
import { execute as updateChatTitle } from "./updateChatTitle";
import { execute as publishReport } from "./publishReport";
import { execute as sendResearchEmail } from "./sendResearchEmail";
import { execute as sendDirectMessage } from "./sendDirectMessage";
import { execute as createResearchSchedule } from "./createResearchSchedule";

type ToolHandler = (context: ToolExecutionContext) => Promise<ExecutorResult>;

const REGISTRY: Record<ToolFunctionName, ToolHandler> = {
  firecrawl_search_web: searchWeb,
  firecrawl_search_research: searchResearch,
  firecrawl_search_developer: searchDeveloper,
  firecrawl_map_site: mapSite,
  firecrawl_scrape_page: scrapePage,
  firecrawl_batch_scrape: batchScrape,
  firecrawl_crawl_site: crawlSite,
  firecrawl_parse_document: parseDocument,
  firecrawl_extract_structured: extractStructured,
  firecrawl_query_page: queryPage,
  firecrawl_interact_page: interactPage,
  firecrawl_browser_research: browserResearch,
  firecrawl_extract_media: extractMedia,
  firecrawl_compare_page_change: comparePageChange,
  firecrawl_agent_gather: agentGather,
  list_stored_reports: listStoredReports,
  read_stored_report: readStoredReport,
  update_chat_title: updateChatTitle,
  publish_report: publishReport,
  send_research_email: sendResearchEmail,
  send_direct_message: sendDirectMessage,
  create_research_schedule: createResearchSchedule,
};

export function getToolHandler(name: ToolFunctionName): ToolHandler {
  return REGISTRY[name];
}

export async function executeRegisteredTool(
  name: ToolFunctionName,
  context: ToolExecutionContext,
): Promise<ExecutorResult> {
  return await getToolHandler(name)(context);
}
