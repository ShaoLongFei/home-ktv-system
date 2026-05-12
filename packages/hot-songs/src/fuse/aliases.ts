import { z } from "zod";

export const FusionAliasesSchema = z.object({
  titleAliases: z.record(z.string(), z.array(z.string().min(1))).optional(),
  artistAliases: z.record(z.string(), z.array(z.string().min(1))).optional()
});

export type FusionAliases = z.infer<typeof FusionAliasesSchema>;

export function buildAliasLookup(
  aliases: Record<string, string[]> | undefined,
  normalize: (value: string) => string
): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const [canonicalValue, aliasValues] of Object.entries(aliases ?? {})) {
    const canonicalKey = normalize(canonicalValue);
    if (canonicalKey.length === 0) {
      continue;
    }

    lookup.set(canonicalKey, canonicalKey);
    for (const aliasValue of aliasValues) {
      const aliasKey = normalize(aliasValue);
      if (aliasKey.length > 0) {
        lookup.set(aliasKey, canonicalKey);
      }
    }
  }

  return lookup;
}

export function resolveAlias(value: string, lookup: Map<string, string>): string {
  return lookup.get(value) ?? value;
}
