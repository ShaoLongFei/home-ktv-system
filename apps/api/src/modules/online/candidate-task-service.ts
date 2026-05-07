import type {
  OnlineCandidateCard,
  OnlineCandidateTask,
  OnlineCandidateTaskState,
  RoomId
} from "@home-ktv/domain";
import type { ProviderRegistry } from "./provider-registry.js";

export interface CandidateTaskServiceRepository {
  upsertDiscovered(input: { roomId: RoomId; candidate: OnlineCandidateCard }): Promise<OnlineCandidateTask>;
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
    }
  ): Promise<OnlineCandidateTask | null>;
}

export interface CandidateTaskServiceOptions {
  registry: ProviderRegistry;
  repository: CandidateTaskServiceRepository;
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

export class CandidateTaskService {
  constructor(private readonly options: CandidateTaskServiceOptions) {}

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

    return this.options.repository.transition(task.id, {
      status,
      failureReason,
      recentEvent: {
        type: status === "selected" ? "supplement-selected" : "supplement-review-required",
        message: status === "selected" ? "Selected for cache flow" : "Supplement request needs review"
      }
    });
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
