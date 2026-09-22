import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { makeFunctionReference } from "convex/server";

const openAIDrive = makeFunctionReference<
  "action",
  { runId: Id<"researchRuns">; generation: number }
>("workers/runWorker:drive");

export async function scheduleRunDrive(
  ctx: Pick<MutationCtx, "scheduler">,
  run: Pick<Doc<"researchRuns">, "_id">,
  generation: number,
  delayMs: number,
) {
  await ctx.scheduler.runAfter(delayMs, openAIDrive, {
    runId: run._id,
    generation,
  });
}
