# Phase 13: Normalization and Dedupe - Research

**Researched:** 2026-05-10
**Domain:** TypeScript source-row normalization, conservative dedupe, candidate identity snapshots
**Confidence:** HIGH

## User Constraints

Phase 13 follows the completed Phase 12 source harness. The user has usable source rows, but not yet a ranked song list. This phase must produce a conservative candidate identity layer only.

Binding constraints from ROADMAP, REQUIREMENTS, STATE, and Phase 12 summaries:

- Phase 13 covers `NORM-01`, `NORM-02`, `NORM-03`, and `NORM-04`.
- Preserve raw source title/artist values and every source evidence row.
- Merge only rows that confidently represent the same song identity.
- Same-title different-artist songs must remain separate.
- Variant markers such as `Live`, `DJ`, `Remix`, `伴奏`, `翻唱`, `片段`, `女声版`, `男声版`, and similar descriptors must surface as warnings or later penalties, not disappear.
- Produce stable candidate IDs and canonical song keys suitable for later weekly comparison and OpenList matching, but do not implement those workflows.
- Do not implement scoring, ranking tiers, Markdown/CSV final exports, OpenList matching, downloads, scheduler, weekly diff/history, Admin UI, OCR, DB/catalog mutation, or playback/runtime changes.

## Phase 12 Inputs

Phase 12 provides:

- `packages/hot-songs/src/contracts.ts` with `SourceRow` and `SourceStatus` contracts.
- `packages/hot-songs/src/cli.ts` with `source-rows.json` and `source-report.json` output.
- `.planning/reports/hot-songs/phase-12-fixture-all/source-rows.json` with 15 raw rows.
- `.planning/reports/hot-songs/phase-12-fixture-all/source-report.json` with 5 usable source statuses.
- `packages/hot-songs/config/sources.example.json` with KTV-first and support source weights.

The Phase 12 fixture rows should normalize into six candidates:

1. `后来` / `刘若英`
2. `小幸运` / `田馥甄`
3. `Run Wild（向风而野）` / `周深`
4. `同手同脚 (Live)` / `温岚`
5. `十年` / `陈奕迅`
6. `晴天` / `周杰伦`

## Recommended Architecture

Keep Phase 13 inside `@home-ktv/hot-songs` and add a normalization subsystem:

```text
packages/hot-songs/src/
├── normalize/
│   ├── contracts.ts      # Candidate evidence/snapshot schemas and inferred types
│   ├── text.ts           # Unicode cleanup, title/artist key generation
│   ├── variants.ts       # Variant/noise marker detection
│   └── candidates.ts     # Conservative grouping, stable ids, snapshot builder
├── normalize-cli.ts      # Reads source rows/report, writes candidate-snapshot.json
└── test/
    ├── normalize.test.ts
    └── candidates.test.ts
```

No new dependency is needed. Use Node `crypto.createHash("sha256")` for stable candidate IDs and standard Unicode normalization plus regex rules for canonical keys.

## Normalization Rules

### Title Display vs Key

Keep both:

- `displayTitle`: readable title selected from evidence, preserving meaningful variant text.
- `canonicalTitleKey`: deterministic key used for grouping.
- `baseTitleKey`: variant-stripped helper key for later warnings/scoring, not a grouping key by itself.
- `variantSignature`: deterministic marker signature included in the grouping key so `同手同脚` and `同手同脚 (Live)` do not merge silently.

Recommended key behavior:

- Trim whitespace.
- Normalize full-width ASCII to half-width through `NFKC`.
- Lowercase ASCII.
- Convert punctuation and separators to spaces.
- Remove bracket punctuation while preserving bracket contents for variant detection.
- Collapse repeated whitespace.
- Keep Chinese characters unchanged.
- Do not translate, romanize, simplify/traditional convert, or infer aliases in Phase 13.

### Artist Key

Use canonical artist keys as part of the identity:

- Split only where the source already supplies multiple artist names or obvious separators in an artist field.
- Trim, NFKC normalize, lowercase ASCII, collapse punctuation/whitespace.
- Sort canonical artist keys for duet order stability.
- Keep display artists in a readable evidence-derived order.
- Same title with different canonical artist keys must produce separate candidates.

### Variant Detection

Detect, do not delete. Variant warnings should include stable codes such as:

- `variant-live`
- `variant-dj`
- `variant-remix`
- `variant-accompaniment`
- `variant-cover`
- `variant-clip`
- `variant-gender-version`
- `variant-version`

Variant detection sources:

- Parenthetical text: `(Live)`, `（Live）`, `(DJ版)`, `（伴奏）`.
- Suffix tokens: `Live`, `Remix`, `DJ`, `伴奏`, `翻唱`, `片段`, `女声版`, `男声版`, `版`.
- Existing source row warnings should remain attached to evidence and may also lift to candidate warnings.

## Candidate Snapshot Contract

Add schema-versioned output:

```json
{
  "schemaVersion": "hot-songs.candidate-snapshot.v1",
  "generatedAt": "...",
  "sourceRowCount": 15,
  "candidateCount": 6,
  "sourceStatuses": [...],
  "candidates": [...]
}
```

Candidate fields:

- `candidateId`: stable hash id, e.g. `song_<16 hex>`.
- `songKey`: stable readable canonical key, including title key, artist keys, and variant signature.
- `canonicalTitleKey`
- `baseTitleKey`
- `canonicalArtistKeys`
- `variantSignature`
- `displayTitle`
- `displayArtists`
- `evidence`: all raw source rows, with sourceId/sourceType/provider/rank/rawTitle/rawArtists/sourceUrl/sourcePublishedAt/collectedAt/warnings.
- `sourceIds`
- `sourceTypes`
- `warnings`

## Conservative Dedupe Policy

Merge rows only when all grouping components match:

```text
canonicalTitleKey + sorted canonicalArtistKeys + variantSignature
```

This satisfies:

- `后来` from QQ/CAVCA/Kugou/NetEase by `刘若英` merges.
- `小幸运` by `田馥甄` merges.
- `Run Wild（向风而野）` by `周深` merges.
- `同手同脚 (Live)` stays separate and carries `variant-live`.
- Same title by different artists stays separate because artist keys differ.

Avoid fuzzy matching in Phase 13. Fuzzy matching would risk false merges and needs review tooling not yet present.

## CLI Pattern

Add a separate normalization command:

```bash
pnpm hot-songs:normalize -- --source-rows <source-rows.json> --source-report <source-report.json> --out <dir>
```

It should:

- Resolve paths with the same root-relative pattern as Phase 12.
- Validate source rows and source report.
- Write `<outDir>/candidate-snapshot.json`.
- Print `Candidate normalization complete: <candidateCount> candidates from <sourceRowCount> source rows`.

This keeps Phase 13 independently verifiable without combining source collection and ranking yet. Phase 14 can compose the full end-to-end generator.

## Validation Strategy

Required verification:

- Unit tests for title/artist normalization and variant detection.
- Unit tests for conservative grouping:
  - same song across sources merges;
  - same title different artist does not merge;
  - variant rows carry warnings and do not disappear;
  - candidate IDs are stable across input row order.
- CLI fixture test using Phase 12 fixture outputs writes a candidate snapshot with 6 candidates.
- Scope guard confirming no scoring/ranking/tier/export/download/scheduler/Admin/DB/runtime features were added.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| False merge of different songs | Use exact normalized title + exact artist key set + variant signature only. |
| Variant text silently discarded | Store base key separately and include variant signature/warnings in candidate. |
| Output cannot be compared later | Stable `songKey` and SHA-256 `candidateId` from canonical components. |
| Phase drift into ranking/export | Only write candidate snapshot JSON; Phase 14 owns scoring and Markdown/CSV outputs. |

## Plan Recommendation

Use 3 execution plans:

1. **13-01:** Candidate contracts, text normalization, artist normalization, and variant detection.
2. **13-02:** Candidate grouping, stable keys/IDs, evidence preservation, and conservative dedupe.
3. **13-03:** Normalization CLI, fixture snapshot artifact, and scope verification.

---
*Phase: 13-normalization-and-dedupe*
*Research completed: 2026-05-10*
