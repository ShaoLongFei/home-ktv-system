import path from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { loadConfig, normalizeApiConfig } from "../config.js";
import { IgebaClient } from "../modules/online/igeba/igeba-client.js";
import { createIgebaProvider } from "../modules/online/igeba/igeba-provider.js";
import { PgOnlineCatalogRepository } from "../modules/online/online-catalog-repository.js";
import { OnlineImportService, type OnlineImportServiceStatus } from "../modules/online/online-import-service.js";

export interface IgebaLibraryLoadOptions {
  query: string;
  packageType: number | null;
  packageId: string | null;
  limit: number;
  dryRun: boolean;
  help: boolean;
}

export interface IgebaLibraryLoadDependencies {
  createService?: () => Promise<{
    service: Pick<OnlineImportService, "importByQuery" | "importByPackage" | "status" | "whenIdle">;
    close: () => Promise<void>;
  }>;
  env?: Record<string, string | undefined>;
  stdout?: (line: string) => void;
}

export function parseIgebaLibraryLoadArgs(argv: readonly string[]): IgebaLibraryLoadOptions {
  const options: IgebaLibraryLoadOptions = {
    query: "",
    packageType: null,
    packageId: null,
    limit: 10,
    dryRun: false,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--query":
      case "-q": {
        const value = argv[index + 1] ?? "";
        options.query = value;
        index += 1;
        break;
      }
      case "--package-type": {
        const value = Number.parseInt(argv[index + 1] ?? "", 10);
        options.packageType = Number.isFinite(value) && value > 0 ? value : null;
        index += 1;
        break;
      }
      case "--package-id": {
        options.packageId = argv[index + 1] ?? null;
        index += 1;
        break;
      }
      case "--limit":
      case "-l": {
        const value = Number.parseInt(argv[index + 1] ?? "", 10);
        options.limit = Number.isFinite(value) && value > 0 ? Math.min(50, value) : 10;
        index += 1;
        break;
      }
      case "--dry-run": {
        options.dryRun = true;
        break;
      }
      case "--help":
      case "-h": {
        options.help = true;
        break;
      }
      default:
        break;
    }
  }
  return options;
}

export async function runIgebaLibraryLoadCli(
  argv: readonly string[],
  dependencies: IgebaLibraryLoadDependencies = {}
): Promise<number> {
  const options = parseIgebaLibraryLoadArgs(argv);
  const stdout = dependencies.stdout ?? ((line: string) => console.log(line));

  if (options.help) {
    stdout(`用法:`);
    stdout(`  igeba:load -- --query "周杰伦" [--limit 10] [--dry-run]`);
    stdout(`  igeba:load -- --package-type 3 --package-id 13166 [--limit 20]`);
    stdout(`  package-type: 1=歌手 2=专辑 3=歌单 4=榜单 5=私有歌单`);
    return 0;
  }
  if (!options.query.trim() && !options.packageId) {
    stdout(`缺少 --query 或 --package-id 参数。用法见 --help`);
    return 1;
  }
  if (options.dryRun) {
    stdout(
      options.packageId
        ? `[dry-run] 将导入 package ${options.packageType ?? 3}:${options.packageId} 的前 ${options.limit} 首`
        : `[dry-run] 将导入关键字 "${options.query}" 的前 ${options.limit} 首`
    );
  }

  const env = dependencies.env ?? process.env;
  const config = normalizeApiConfig(loadConfig(env));
  const igeba = config.igeba;
  if (!igeba?.enabled) {
    stdout("ige8 provider 未启用：请设置 ONLINE_PROVIDER_IDS=igeba 与 MEDIA_ROOT（或 IGEBA_CACHE_DIR）。");
    return 1;
  }

  const owned = dependencies.createService
    ? undefined
    : await createDefaultService(config, igeba);
  const handle = dependencies.createService ? await dependencies.createService() : owned;
  if (!handle) {
    return 1;
  }

  try {
    const results = options.packageId
      ? await handle.service.importByPackage({
          packageType: options.packageType ?? 3,
          packageId: options.packageId,
          limit: options.limit
        })
      : await handle.service.importByQuery(options.query, options.limit);
    stdout(`已排队 ${results.length} 首，等待缓存完成…`);
    await handle.service.whenIdle();
    const status = await handle.service.status();
    printStatus(stdout, status);
    return 0;
  } finally {
    await handle.close();
  }
}

async function createDefaultService(
  config: ReturnType<typeof normalizeApiConfig>,
  igeba: NonNullable<ReturnType<typeof normalizeApiConfig>["igeba"]>
): Promise<{ service: OnlineImportService; close: () => Promise<void> }> {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL 未配置，无法写入 online_songs / online_song_assets");
  }
  const pool = new Pool({ connectionString: config.databaseUrl });
  const client = new IgebaClient({
    baseUrl: igeba.baseUrl,
    uid: igeba.uid,
    minIntervalMs: igeba.minIntervalMs,
    requestTimeoutMs: igeba.requestTimeoutMs,
    resolveAttempts: igeba.resolveAttempts
  });
  const service = new OnlineImportService({
    provider: createIgebaProvider(client),
    repository: new PgOnlineCatalogRepository(pool),
    cacheDir: igeba.cacheDir,
    concurrency: igeba.concurrency
  });
  return { service, close: () => pool.end() };
}

function printStatus(stdout: (line: string) => void, status: OnlineImportServiceStatus): void {
  stdout(
    `完成：ready=${status.stats.ready} failed=${status.stats.failed} ` +
      `unavailable=${status.stats.unavailable} bytes=${status.stats.bytes}`
  );
  stdout(`缓存目录：${status.cacheDir}`);
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] ?? "")).href) {
  runIgebaLibraryLoadCli(process.argv.slice(2))
    .then((exitCode) => process.exit(exitCode))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
