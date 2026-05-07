import type { OnlineCandidateCard } from "@home-ktv/domain";
import type { OnlineCandidateProvider } from "./provider-registry.js";

export interface DemoOnlineProviderInput {
  readyAssetId: string;
}

export function createDemoOnlineProvider(input: DemoOnlineProviderInput): OnlineCandidateProvider {
  return {
    id: "demo-local",
    sourceLabel: "Local Demo Provider",
    capabilities: {
      canDiscover: true,
      canCache: true
    },
    async search(searchInput) {
      const query = searchInput.query.trim();
      if (!query || searchInput.limit <= 0) {
        return [];
      }

      return [createDemoCandidate(query)];
    },
    async prepareFetch({ task }) {
      return {
        cacheKey: `demo-local/${task.providerCandidateId}`,
        metadata: {
          provider: "demo-local",
          providerCandidateId: task.providerCandidateId
        }
      };
    },
    async verify() {
      if (input.readyAssetId.trim()) {
        return {
          status: "ready",
          readyAssetId: input.readyAssetId.trim(),
          metadata: {
            provider: "demo-local"
          }
        };
      }

      return {
        status: "review_required",
        reason: "demo-ready-asset-not-configured"
      };
    }
  };
}

function createDemoCandidate(query: string): OnlineCandidateCard {
  return {
    provider: "demo-local",
    providerCandidateId: `demo-local-${query}`,
    title: query,
    artistName: "Local Demo Artist",
    sourceLabel: "Local Demo Provider",
    durationMs: 180000,
    candidateType: "mv",
    reliabilityLabel: "high",
    riskLabel: "normal",
    taskState: "discovered",
    taskId: null
  };
}
