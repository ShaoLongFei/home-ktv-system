import type {
  AssetId,
  OnlineCandidateCard,
  OnlineCandidateTask,
  OnlineCandidateTaskId,
  OnlineCandidateTaskState,
  RoomId
} from "@home-ktv/domain";
import type { ProviderRegistry } from "./provider-registry.js";

export interface CandidateTaskServiceRepository {
  upsertDiscovered(input: { roomId: RoomId; candidate: OnlineCandidateCard }): Promise<OnlineCandidateTask>;
  findById(taskId: OnlineCandidateTaskId): Promise<OnlineCandidateTask | null>;
  listActiveForRoom(roomId: RoomId): Promise<OnlineCandidateTask[]>;
  findByProviderCandidate(input: {
    roomId: RoomId;
    provider: string;
    providerCandidateId: string;
  }): Promise<OnlineCandidateTask | null>;
  transition(
    taskId: string,
    input: {
      status: OnlineCandidateTaskState;
      failureReason?: string | null;
      recentEvent?: Record<string, unknown>;
      readyAssetId?: AssetId | null;
    }
  ): Promise<OnlineCandidateTask | null>;
}

export interface CandidateTaskServiceOptions {
  registry: ProviderRegistry;
  repository: CandidateTaskServiceRepository;
}

export interface SelectedCandidateTaskProcessor {
  processTask(input: { roomId: RoomId; taskId: OnlineCandidateTaskId }): Promise<OnlineCandidateTask | null>;
}

export interface DiscoverOnlineCandidatesInput {
  roomId: RoomId;
  query: string;
  limit?: number;
}

export interface RequestSupplementInput {
  roomId: RoomId;
  provider: string;
  providerCandidateId: string;
}

export interface TransitionMetadataInput {
  metadata?: Record<string, unknown>;
}

export interface MarkReadyInput extends TransitionMetadataInput {
  readyAssetId: AssetId;
}

export interface MarkFailureInput extends TransitionMetadataInput {
  reason: string;
}

export interface RoomScopedTaskInput {
  roomId: RoomId;
  taskId: OnlineCandidateTaskId;
}

export class CandidateTaskService {
  private selectedTaskProcessor: SelectedCandidateTaskProcessor | null = null;

  constructor(private readonly options: CandidateTaskServiceOptions) {}

  attachSelectedTaskProcessor(processor: SelectedCandidateTaskProcessor): void {
    this.selectedTaskProcessor = processor;
  }

  async discoverCandidates(input: DiscoverOnlineCandidatesInput): Promise<OnlineCandidateCard[]> {
    const discovered = await this.options.registry.searchEnabled({
      query: input.query,
      limit: input.limit ?? 10
    });
    const deduped = dedupeCandidates(discovered);
    const cards: OnlineCandidateCard[] = [];

    for (const candidate of deduped) {
      const task = await this.options.repository.upsertDiscovered({
        roomId: input.roomId,
        candidate
      });
      cards.push({
        provider: task.provider,
        providerCandidateId: task.providerCandidateId,
        title: task.title,
        artistName: task.artistName,
        sourceLabel: task.sourceLabel,
        durationMs: task.durationMs,
        candidateType: task.candidateType,
        reliabilityLabel: task.reliabilityLabel,
        riskLabel: task.riskLabel,
        taskState: task.status,
        taskId: task.id
      });
    }

    return cards;
  }

  async requestSupplement(input: RequestSupplementInput): Promise<OnlineCandidateTask | null> {
    const task = await this.options.repository.findByProviderCandidate(input);
    if (!task) {
      return null;
    }

    const provider = this.options.registry.getCacheCapableProvider(task.provider);
    const status: OnlineCandidateTaskState = provider && task.riskLabel === "normal" ? "selected" : "review_required";
    const failureReason = provider ? null : "provider-not-cache-capable-or-disabled";

    const selected = await this.options.repository.transition(task.id, {
      status,
      failureReason,
      recentEvent: {
        type: status === "selected" ? "supplement-selected" : "supplement-review-required",
        message: status === "selected" ? "Selected for cache flow" : "Supplement request needs review"
      }
    });
    return this.processSelectedTask(selected);
  }

  async listActiveForRoom(roomId: RoomId): Promise<OnlineCandidateTask[]> {
    return this.options.repository.listActiveForRoom(roomId);
  }

  async getTask(input: RoomScopedTaskInput): Promise<OnlineCandidateTask | null> {
    const task = await this.options.repository.findById(input.taskId);
    if (!task || task.roomId !== input.roomId) {
      return null;
    }
    return task;
  }

  async markFetching(taskId: OnlineCandidateTaskId, metadata: Record<string, unknown> = {}): Promise<OnlineCandidateTask | null> {
    return this.transition(taskId, "fetching", {
      recentEvent: {
        type: "fetching",
        ...metadata
      }
    });
  }

  async markFetched(taskId: OnlineCandidateTaskId, metadata: Record<string, unknown> = {}): Promise<OnlineCandidateTask | null> {
    return this.transition(taskId, "fetched", {
      recentEvent: {
        type: "fetched",
        ...metadata
      }
    });
  }

  async markReady(taskId: OnlineCandidateTaskId, input: MarkReadyInput): Promise<OnlineCandidateTask | null> {
    return this.transition(taskId, "ready", {
      readyAssetId: input.readyAssetId,
      recentEvent: {
        type: "ready",
        ...(input.metadata ?? {})
      }
    });
  }

  async markReviewRequired(taskId: OnlineCandidateTaskId, input: MarkFailureInput): Promise<OnlineCandidateTask | null> {
    return this.transition(taskId, "review_required", {
      failureReason: input.reason,
      recentEvent: {
        type: "review_required",
        reason: input.reason,
        ...(input.metadata ?? {})
      }
    });
  }

  async markFailed(taskId: OnlineCandidateTaskId, input: MarkFailureInput): Promise<OnlineCandidateTask | null> {
    return this.transition(taskId, "failed", {
      failureReason: input.reason,
      recentEvent: {
        type: "failed",
        reason: input.reason,
        ...(input.metadata ?? {})
      }
    });
  }

  async markStale(taskId: OnlineCandidateTaskId, input: MarkFailureInput): Promise<OnlineCandidateTask | null> {
    return this.transition(taskId, "stale", {
      failureReason: input.reason,
      recentEvent: {
        type: "stale",
        reason: input.reason,
        ...(input.metadata ?? {})
      }
    });
  }

  async retryTask(input: RoomScopedTaskInput): Promise<OnlineCandidateTask | null> {
    const task = await this.getTask(input);
    if (!task || !["failed", "stale", "review_required"].includes(task.status)) {
      return null;
    }

    const selected = await this.transition(task.id, "selected", {
      recentEvent: {
        type: "retry",
        previousStatus: task.status
      }
    });
    return this.processSelectedTask(selected);
  }

  async promoteTask(input: RoomScopedTaskInput): Promise<OnlineCandidateTask | null> {
    const task = await this.getTask(input);
    if (!task || task.status !== "ready") {
      return null;
    }

    return this.transition(task.id, "promoted", {
      readyAssetId: task.readyAssetId,
      recentEvent: {
        type: "promoted",
        previousStatus: task.status,
        readyAssetId: task.readyAssetId
      }
    });
  }

  async purgeTask(input: RoomScopedTaskInput): Promise<OnlineCandidateTask | null> {
    const task = await this.getTask(input);
    if (!task || !["failed", "stale"].includes(task.status)) {
      return null;
    }

    return this.transition(task.id, "purged", {
      recentEvent: {
        type: "purged",
        previousStatus: task.status
      }
    });
  }

  private async transition(
    taskId: OnlineCandidateTaskId,
    status: OnlineCandidateTaskState,
    input: {
      failureReason?: string | null;
      recentEvent?: Record<string, unknown>;
      readyAssetId?: AssetId | null;
    } = {}
  ): Promise<OnlineCandidateTask | null> {
    const transitionInput: {
      status: OnlineCandidateTaskState;
      failureReason?: string | null;
      recentEvent?: Record<string, unknown>;
      readyAssetId?: AssetId | null;
    } = {
      status,
      failureReason: input.failureReason ?? null
    };

    if (input.recentEvent) {
      transitionInput.recentEvent = input.recentEvent;
    }
    if (input.readyAssetId !== undefined) {
      transitionInput.readyAssetId = input.readyAssetId;
    }

    return this.options.repository.transition(taskId, transitionInput);
  }

  private async processSelectedTask(task: OnlineCandidateTask | null): Promise<OnlineCandidateTask | null> {
    if (!task || task.status !== "selected" || !this.selectedTaskProcessor) {
      return task;
    }

    const processed = await this.selectedTaskProcessor.processTask({
      roomId: task.roomId,
      taskId: task.id
    });
    return processed ?? task;
  }
}

function dedupeCandidates(candidates: OnlineCandidateCard[]): OnlineCandidateCard[] {
  const seen = new Set<string>();
  const deduped: OnlineCandidateCard[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.provider}:${candidate.providerCandidateId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}
