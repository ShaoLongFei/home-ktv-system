# Phase 13: MediaInfo Probe, Scanner, and Sidecars - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-12
**Phase:** 13-mediainfo-probe-scanner-and-sidecars
**Areas discussed:** GSD phase hygiene, discovery scope, sidecar matching, metadata precedence, stability/retry, compatibility surface

---

## GSD Phase Hygiene

| Option | Description | Selected |
|--------|-------------|----------|
| Archive old hot-songs phase directories | Move old `12-source-contracts-and-fetch-harness`, `13-normalization-and-dedupe`, and `13.1-full-chart-coverage` out of active `.planning/phases` so current v1.2 Phase 13 resolves correctly. | yes |
| Leave old directories in place | Would require manual path overrides and risks future plan/execute commands using the wrong phase. | |

**User's choice:** Option 1, archive old directories and continue.
**Notes:** The old directories were moved to `.planning/legacy/hot-songs-phases/`.

---

## Discovery Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Existing scan roots plus MKV/MPG/MPEG | Reuse `MEDIA_ROOT/imports/pending` and existing scan trigger while adding real MV extensions. | yes |
| New dedicated real-MV root | More isolation, but adds user setup and new routing surface before needed. | |

**User's choice:** Inferred from milestone decisions and prior setup.
**Notes:** User wants real songs already placed under `MEDIA_ROOT` to enter the existing scan flow.

---

## Sidecar Matching

| Option | Description | Selected |
|--------|-------------|----------|
| Same-stem sidecars beside media | Keeps one folder previewable: media, cover, and `song.json` sit together. | yes |
| Central metadata registry | Easier global editing later, but less convenient for local preview/loading. | |

**User's choice:** Same-stem sidecars beside the file.
**Notes:** User explicitly requested single-file song organization with cover and `song.json` next to the file.

---

## Metadata Precedence

| Option | Description | Selected |
|--------|-------------|----------|
| MediaInfo first, filename and sidecar fill gaps | Keeps technical metadata trustworthy while using local naming/sidecars to improve review defaults. | yes |
| Sidecar overrides everything | Gives user control but can hide probe facts or stale metadata. | |
| Filename first | Simple, but unreliable for real MV technical facts and conflicts. | |

**User's choice:** MediaInfo first, then filename and `song.json` fallback.
**Notes:** Conflicts should be preserved for Admin review rather than silently overwritten.

---

## Stability And Retry

| Option | Description | Selected |
|--------|-------------|----------|
| Lightweight stability check | Compare file size/mtime over a short delay or retry on change; avoids probing partial files without making scan heavy. | yes |
| Heavy lock/complete-file protocol | More robust but requires user workflow changes and extra markers. | |
| Probe immediately | Fastest but risks corrupt probe state while copying large MV files. | |

**User's choice:** Lightweight stability check.
**Notes:** The system should remain light and let scheduled/manual scans catch up.

---

## Compatibility Surface

| Option | Description | Selected |
|--------|-------------|----------|
| Scanner populates review-oriented compatibility facts | Fill MediaInfo, playback profile, track roles when obvious, and mark uncertain cases `review_required`. | yes |
| Scanner decides full playability | Too early because browser/TV track switching is runtime-dependent. | |

**User's choice:** Inferred from Phase 12 decisions.
**Notes:** Full Admin review and playback verification are Phase 14/15 work.

---

## the agent's Discretion

- Exact sidecar filename convention can be finalized during planning, but it must be same-stem and documented.
- Exact scanner stability interval can be chosen during implementation as long as it is lightweight.
- Exact candidate metadata shape can follow repository/schema patterns discovered during research.

## Deferred Ideas

- Admin review UI and formal catalog admission remain Phase 14.
- Real MV search/queue/playback and track switching remain Phase 15.
- Android TV native app and transcoding/remuxing are future work.
