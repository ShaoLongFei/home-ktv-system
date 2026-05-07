import type { OnlineCandidateCard } from "@home-ktv/domain";

export interface OnlineCandidateProvider {
  id: string;
  sourceLabel: string;
  capabilities: {
    canDiscover: boolean;
    canCache: boolean;
  };
  search(input: OnlineCandidateProviderSearchInput): Promise<OnlineCandidateCard[]>;
}

export interface OnlineCandidateProviderSearchInput {
  query: string;
  limit: number;
}

export interface ProviderRegistryOptions {
  providers: OnlineCandidateProvider[];
  enabledProviderIds: readonly string[];
  killSwitchProviderIds: readonly string[];
}

export interface ProviderRegistry {
  searchEnabled(input: OnlineCandidateProviderSearchInput): Promise<OnlineCandidateCard[]>;
  getCacheCapableProvider(providerId: string): OnlineCandidateProvider | null;
}

export function createProviderRegistry(options: ProviderRegistryOptions): ProviderRegistry {
  const providers = new Map(options.providers.map((provider) => [provider.id, provider]));
  const enabled = new Set(options.enabledProviderIds);
  const killed = new Set(options.killSwitchProviderIds);

  function isEnabled(provider: OnlineCandidateProvider): boolean {
    return enabled.has(provider.id) && !killed.has(provider.id);
  }

  return {
    async searchEnabled(input) {
      const results: OnlineCandidateCard[] = [];
      for (const provider of providers.values()) {
        if (!isEnabled(provider) || !provider.capabilities.canDiscover) {
          continue;
        }
        const candidates = await provider.search(input);
        for (const candidate of candidates) {
          results.push({
            ...candidate,
            provider: provider.id,
            sourceLabel: candidate.sourceLabel || provider.sourceLabel
          });
        }
      }
      return results;
    },

    getCacheCapableProvider(providerId) {
      const provider = providers.get(providerId) ?? null;
      if (!provider || !isEnabled(provider) || !provider.capabilities.canCache) {
        return null;
      }
      return provider;
    }
  };
}
