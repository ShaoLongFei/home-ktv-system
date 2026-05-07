import type { OnlineCandidateTask, RoomId } from "@home-ktv/domain";
import type { CandidateTaskService } from "./candidate-task-service.js";
import type { ProviderRegistry } from "./provider-registry.js";

export interface CandidateCacheWorkerOptions {
  registry: ProviderRegistry;
  service: Pick<
    CandidateTaskService,
    "getTask" | "markFetching" | "markFetched" | "markReady" | "markReviewRequired" | "markFailed"
  >;
}

export interface ProcessCandidateTaskInput {
  roomId: RoomId;
  taskId: string;
}

export class CandidateCacheWorker {
  constructor(private readonly options: CandidateCacheWorkerOptions) {}

  async processTask(input: ProcessCandidateTaskInput): Promise<OnlineCandidateTask | null> {
    const task = await this.options.service.getTask(input);
    if (!task || task.status !== "selected") {
      return task;
    }

    const provider = this.options.registry.getCacheCapableProvider(task.provider);
    if (!provider || !provider.prepareFetch || !provider.verify) {
      return this.options.service.markReviewRequired(task.id, {
        reason: "provider-disabled-or-not-cache-capable"
      });
    }

    try {
      await this.options.service.markFetching(task.id, {
        provider: task.provider,
        providerCandidateId: task.providerCandidateId
      });
      const fetchingTask = (await this.options.service.getTask(input)) ?? task;
      const fetchResult = await provider.prepareFetch({ task: fetchingTask });
      await this.options.service.markFetched(task.id, {
        cacheKey: fetchResult.cacheKey,
        ...(fetchResult.metadata ?? {})
      });
      const fetchedTask = (await this.options.service.getTask(input)) ?? fetchingTask;
      const verification = await provider.verify({ task: fetchedTask, fetchResult });

      if (verification.status === "ready") {
        return this.options.service.markReady(task.id, {
          readyAssetId: verification.readyAssetId,
          ...(verification.metadata ? { metadata: verification.metadata } : {})
        });
      }

      if (verification.status === "review_required") {
        return this.options.service.markReviewRequired(task.id, {
          reason: verification.reason,
          ...(verification.metadata ? { metadata: verification.metadata } : {})
        });
      }

      return this.options.service.markFailed(task.id, {
        reason: verification.reason,
        ...(verification.metadata ? { metadata: verification.metadata } : {})
      });
    } catch (error) {
      return this.options.service.markFailed(task.id, {
        reason: error instanceof Error ? error.message : "candidate-cache-worker-failed",
        metadata: {
          provider: task.provider,
          providerCandidateId: task.providerCandidateId
        }
      });
    }
  }
}
