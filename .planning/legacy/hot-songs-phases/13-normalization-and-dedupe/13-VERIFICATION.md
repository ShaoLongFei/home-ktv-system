---
phase: 13-normalization-and-dedupe
verified: 2026-05-10T06:54:24Z
status: passed
score: 4/4 must-haves verified
requirements: [NORM-01, NORM-02, NORM-03, NORM-04]
---

# Phase 13: Normalization and Dedupe Verification Report

**Phase Goal:** User receives a conservative candidate identity layer that preserves source evidence, merges only same-song rows, flags noisy variants, and emits stable keys for later workflows.  
**Verified:** 2026-05-10T06:54:24Z  
**Status:** passed  
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Candidate output preserves raw source evidence, readable display values, canonical keys, and source statuses | VERIFIED | `CandidateIdentitySchema` includes canonical keys, display fields, warnings, and `evidence`; `CandidateEvidenceSchema` reuses `SourceRowSchema`. Fixture `candidate-snapshot.json` includes `sourceStatuses`, 15 raw evidence rows, display titles/artists, `canonicalTitleKey`, `baseTitleKey`, `canonicalArtistKeys`, and `songKey`. |
| 2 | Same-song rows merge conservatively while same-title different-artist rows stay separate | VERIFIED | `buildCandidateSnapshot()` groups by canonical title key, sorted canonical artist keys, and variant signature. `candidates.test.ts` verifies the Phase 12 fixture produces six candidates, `后来` has five evidence rows, and the literal `same title different artist` test produces two candidates. |
| 3 | Variant markers are detected and surfaced instead of being silently discarded | VERIFIED | `variants.ts` detects Live, DJ, Remix, 伴奏, 翻唱, 片段, 女声版, 男声版, and generic 版 markers. Tests and fixture snapshot verify `同手同脚 (Live)` has `variantSignature: variant-live` and `warnings` containing `variant-live`. |
| 4 | Stable candidate IDs and canonical song keys exist for later comparison/matching workflows, without implementing those workflows | VERIFIED | `buildSongKey()` creates deterministic readable keys; `buildCandidateId()` uses SHA-256 to produce `song_<16 hex>`. Tests verify IDs and song keys remain stable when input rows are reversed. Scope guard found no scoring/ranking/tier/OpenList/download/scheduler/cron/database/postgres/Fastify/Admin UI/OCR additions in normalize scope. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `packages/hot-songs/src/normalize/contracts.ts` | Candidate evidence, identity, and snapshot contracts | VERIFIED | Defines `CandidateEvidenceSchema`, `CandidateIdentitySchema`, `CandidateSnapshotSchema`, and schema version `hot-songs.candidate-snapshot.v1`. |
| `packages/hot-songs/src/normalize/text.ts` | Deterministic title/artist normalization | VERIFIED | Provides `normalizeSearchText()`, `normalizeArtistKey()`, `normalizeArtistKeys()`, and `normalizeTitleIdentity()`. |
| `packages/hot-songs/src/normalize/variants.ts` | Variant/noise marker detection | VERIFIED | Provides `detectVariantWarnings()` and `stripVariantMarkers()` with stable warning codes. |
| `packages/hot-songs/src/normalize/candidates.ts` | Conservative candidate grouping and stable IDs | VERIFIED | Exports `buildCandidateSnapshot()`, `buildCandidateIdentity()`, `buildSongKey()`, and `buildCandidateId()`. |
| `packages/hot-songs/src/normalize-cli.ts` | Normalization CLI | VERIFIED | Exports `parseNormalizeSourcesArgs()` and `runNormalizeSourcesCli()`; writes `candidate-snapshot.json`. |
| `.planning/reports/hot-songs/phase-13-fixture-candidates/candidate-snapshot.json` | Fixture candidate identity snapshot | VERIFIED | Contains schema `hot-songs.candidate-snapshot.v1`, `sourceRowCount=15`, `candidateCount=6`, source statuses, and `variant-live`. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Candidate grouping tests pass | `pnpm -F @home-ktv/hot-songs test -- src/test/candidates.test.ts` | 7 files / 35 tests passed during plan execution | PASS |
| Normalize CLI tests pass | `pnpm -F @home-ktv/hot-songs test -- src/test/normalize-cli.test.ts` | 8 files / 38 tests passed during plan execution | PASS |
| Full hot-songs tests pass | `pnpm -F @home-ktv/hot-songs test` | 8 files / 38 tests passed | PASS |
| Hot-songs typecheck passes | `pnpm -F @home-ktv/hot-songs typecheck` | Exit 0 | PASS |
| Fixture normalize command passes | `pnpm hot-songs:normalize -- --source-rows .planning/reports/hot-songs/phase-12-fixture-all/source-rows.json --source-report .planning/reports/hot-songs/phase-12-fixture-all/source-report.json --out .planning/reports/hot-songs/phase-13-fixture-candidates` | `Candidate normalization complete: 6 candidates from 15 source rows` | PASS |
| Fixture content assertion passes | Node snapshot assertion | Verified schema, generatedAt, row count, candidate count, `后来` evidence, `variant-live`, and `song_` IDs | PASS |
| Scope guard passes | `rg` negative scope check | No out-of-scope keywords found in normalize scope | PASS |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| --- | --- | --- | --- |
| NORM-01 | 13-01, 13-02, 13-03 | SATISFIED | Candidate contracts preserve raw `SourceRow` evidence; snapshot fixture includes source statuses, display values, canonical keys, warnings, and evidence. |
| NORM-02 | 13-02 | SATISFIED | Grouping uses normalized title, sorted artist key set, and variant signature; tests verify `后来` merges across sources and same-title different-artist rows remain separate. |
| NORM-03 | 13-01, 13-02, 13-03 | SATISFIED | Variant warning codes are detected and surfaced; fixture and tests verify `variant-live`. |
| NORM-04 | 13-01, 13-02, 13-03 | SATISFIED | Stable song keys and hashed `song_` candidate IDs are generated; reversed-input test proves stability. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| None | - | - | - | No blocking anti-patterns found. Scope guard found no ranking/export/OpenList/download/scheduler/database/Admin UI/OCR work in Phase 13 normalize scope. |

### Human Verification Required

None. Phase 13 produces backend/tooling artifacts only, and all acceptance criteria are covered by automated tests plus fixture assertions.

### Gaps Summary

No gaps found. Phase 13 achieved the conservative normalization and dedupe identity layer and produced the fixture candidate snapshot needed by Phase 14.

---

_Verified: 2026-05-10T06:54:24Z_  
_Verifier: Codex_
