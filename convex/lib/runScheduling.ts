import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { providerForRun } from "./models";
import { makeFunctionReference } from "convex/server";

const openAIDrive = makeFunctionReference<
  "action",
  { runId: Id<"researchRuns">; generation: number }
>("workers/runWorker:drive");
const zhipuDrive = makeFunctionReference<
  "action",
  { runId: Id<"researchRuns">; generation: number }
>("workers/zhipuRunWorker:drive");

export async function scheduleRunDrive(
  ctx: Pick<MutationCtx, "scheduler">,
  run: Pick<Doc<"researchRuns">, "_id" | "model" | "provider">,
  generation: number,
  delayMs: number,
) {
  const drive = providerForRun(run) === "zhipu" ? zhipuDrive : openAIDrive;
  await ctx.scheduler.runAfter(delayMs, drive, { runId: run._id, generation });
}
