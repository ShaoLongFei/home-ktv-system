# Phase 16 Research

**Phase:** 16-policy-seam-android-reservation-and-hardening
**Gathered:** 2026-05-13
**Status:** Ready for planning

## Scope

Phase 16 is a hardening phase, not a feature-expansion phase. The repo already has the real-MV contract, scan, admission, search, queue, playback, and switch path in place. What remains is to make sure the policy seam stays review-first, compatibility regressions stay covered, local real-media verification can be run against the user’s own library/index, and Android TV remains a contract-only boundary.

## Findings

### Policy seam

- `apps/api/src/modules/catalog/admission-service.ts` already gates approval by explicit `approveCandidate(...)`; there is no production auto-admit flow to preserve.
- `candidateMeta` is `Record<string, unknown>`, so reserved policy metadata can be stored without schema churn.
- `apps/api/src/modules/ingest/candidate-builder.ts` is the best place to stamp reserved policy metadata because it already assembles the real-MV candidate payload.
- A reserved capability should be informational only. It must not flip any admission branch, and Admin/Mobile should not expose a visible enable switch in v1.2.

### Compatibility hardening

- Demo/local song generation, online supplement task handling, queue commands, and Admin catalog maintenance already have direct regression tests.
- The safest Phase 16 move is to add small compatibility assertions to those existing tests rather than redesigning the flows.
- Real-MV schema growth should not disturb legacy demo/local/online behavior.

### Real-media verification

- The user’s local media library and index are the intended source of truth for meaningful verification.
- `songs-sample/关喆-想你的夜(MTV)-国语-流行.mkv` and `songs-sample/蔡依林-BECAUSE OF YOU(演唱会)-国语-流行.mpg` are the two representative local samples already called out for Phase 16.
- `scripts/real-mv-playback-risk-spike.mjs` already provides a portable, sample-based report path; it can be extended into a Phase 16 hardening report that accepts explicit sample paths, `MEDIA_ROOT`, and optional database/index cross-checks.
- Repo tests must stay portable and cannot require binary media fixtures or the user’s local database to exist.

### Android boundary

- `packages/domain/src/index.ts` and `packages/player-contracts/src/index.ts` already define platform-neutral catalog/player contracts.
- The current tests already guard against Android-only terms in playback-profile serialization.
- Phase 16 should add a stronger source guard across the shared contracts and playback runtime so Android-only package seams do not creep into v1.2 by accident.

## Recommended plan split

1. Add a reserved real-MV admission policy helper and persist it in candidate metadata without changing approval behavior.
2. Add compatibility regression assertions for demo/local songs, online supplement tasks, queue commands, and Admin maintenance.
3. Extend the local real-media hardening script so it can use `MEDIA_ROOT`, the two sample files, and optional index/database cross-checks.
4. Add Android boundary source guards and a final regression gate over shared domain/player contracts and real-MV UI.

## Risks

- A policy helper could accidentally become operative if it is wired into approval decisions instead of just being recorded.
- The local hardening script must remain runnable without the user’s local database so CI stays clean.
- The Android guard should check source files and serialized contracts, not just comments, otherwise a new platform-specific field could slip through.

## Validation Strategy

- API regression tests for admission metadata and legacy flows.
- Admin UI regression test for “no visible auto-admit switch”.
- Script tests for `scripts/real-mv-playback-risk-spike.mjs` with controlled mode and local-sample mode.
- Final boundary-gate tests that scan shared contracts/runtime for Android-only leakage.
