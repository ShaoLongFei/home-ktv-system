import type { Pool } from "pg";
import type { ApiConfig } from "../../config.js";
import { CandidateCacheWorker } from "./candidate-cache-worker.js";
import { CandidateTaskService } from "./candidate-task-service.js";
import { createDemoOnlineProvider } from "./demo-provider.js";
import { createProviderRegistry, type OnlineCandidateProvider, type ProviderRegistry } from "./provider-registry.js";
import {
  InMemoryCandidateTaskRepository,
  PgCandidateTaskRepository
} from "./repositories/candidate-task-repository.js";

export interface OnlineRuntime {
  registry: ProviderRegistry;
  tasks: CandidateTaskService;
  worker: CandidateCacheWorker;
}

export interface CreateOnlineRuntimeInput {
  config: ApiConfig;
  pool: Pool | null;
  providers?: readonly OnlineCandidateProvider[];
}

export function createOnlineRuntime(input: CreateOnlineRuntimeInput): OnlineRuntime {
  const providers = [
    createDemoOnlineProvider({ readyAssetId: input.config.onlineDemoReadyAssetId }),
    ...(input.providers ?? [])
  ];
  const registry = createProviderRegistry({
    providers,
    enabledProviderIds: input.config.onlineProviderIds,
    killSwitchProviderIds: input.config.onlineProviderKillSwitchIds
  });
  const tasks = new CandidateTaskService({
    registry,
    repository: input.pool ? new PgCandidateTaskRepository(input.pool) : new InMemoryCandidateTaskRepository()
  });
  const worker = new CandidateCacheWorker({ registry, service: tasks });
  tasks.attachSelectedTaskProcessor(worker);

  return { registry, tasks, worker };
}
