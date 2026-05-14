---
phase: 16-policy-seam-android-reservation-and-hardening
verified: 2026-05-13T13:47:45.690Z
status: passed
score: 4/4 must-haves verified
---

# Phase 16: Policy Seam, Android Reservation, and Hardening Verification Report

**Phase Goal:** Real MV library support remains compatible with existing songs and tasks while reserved policy and platform fields are tested and safe.
**Verified:** 2026-05-13T13:47:45.690Z
**Status:** passed
**Re-verification:** No

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Review-first admission remains the default policy, while auto-admit eligibility is stored only as reserved metadata. | VERIFIED | `real-mv-policy.ts` derives `candidateMeta.realMv.admissionPolicy` with `mode: "review_first"` and `reservedAutoAdmit`; `candidate-builder.ts` stores it on candidates; `CatalogAdmissionService` has no `reservedAutoAdmit` read path; Admin UI tests reject visible auto-admit controls. |
| 2 | Real MV import, playback, and switch behavior is covered by representative two-track and unsupported media cases. | VERIFIED | `real-mv-policy.test.ts`, `real-mv-media-contracts.test.ts`, `real-mv-playback-flow.test.ts`, and `real-mv-admission-regression.test.ts` cover playable two-track, unsupported, selected-track, admission, and disabled/preprocess states. |
| 3 | Existing demo/local songs, online supplement tasks, queue controls, and Admin maintenance remain compatible after real-MV schema changes. | VERIFIED | Phase 16 API compatibility tests cover demo seeding, online candidates/tasks/actions, queue commands, and room/admin refresh behavior; Admin song catalog tests preserve maintenance controls. |
| 4 | Future Android TV expectations remain captured as catalog/player boundaries only, with no native Android TV app entering v1.2. | VERIFIED | `phase-16-boundary-guards.test.ts` scans shared contracts, playback builders, and browser TV runtime files for Android-only vocabulary while requiring browser/player contract terms. Admin review UI guards reject Android/native-app wording. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `apps/api/src/modules/ingest/real-mv-policy.ts` | Pure reserved admission policy helper | VERIFIED | Exports `RealMvAdmissionPolicy` and `deriveRealMvAdmissionPolicy(...)` with locked reason codes and no admission-service dependency. |
| `apps/api/src/modules/ingest/candidate-builder.ts` | Persist policy metadata on real-MV candidates | VERIFIED | Writes `candidateMeta.realMv.admissionPolicy` during candidate construction without changing candidate status. |
| `scripts/real-mv-playback-risk-spike.mjs` | Portable local hardening report CLI | VERIFIED | Supports `--media-root`, `--sample-mkv`, `--sample-mpg`, `--database-url`, controlled-only mode, and optional index cross-check output. |
| `apps/api/src/test/phase-16-boundary-guards.test.ts` | Android boundary source guard | VERIFIED | Reads the narrow shared contract / playback / browser TV source set and rejects Android-only terms including case-normalized `autoAdmit`. |
| `apps/admin/src/test/real-mv-review-ui.test.tsx` | Admin review-only UI guard | VERIFIED | Keeps auto-admit, Android TV, and native app wording out of visible review controls while preserving `批准入库`. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| Candidate builder | Import candidate metadata | `deriveRealMvAdmissionPolicy` | WIRED | `candidateMeta.realMv.admissionPolicy` is present and status remains compatibility-derived. |
| Reserved policy metadata | Catalog admission | No `reservedAutoAdmit` read in admission service | WIRED | Manual Admin approval remains the only admission action. |
| Local sample report | User media library | `MEDIA_ROOT` default sample resolution | WIRED | Report script resolves `songs-sample/关喆-想你的夜(MTV)-国语-流行.mkv` and `songs-sample/蔡依林-BECAUSE OF YOU(演唱会)-国语-流行.mpg`. |
| Shared player contracts | Browser TV runtime | `PlaybackTarget`, `SwitchTarget`, `selectedTrackRef`, `playbackProfile`, `room.snapshot` | WIRED | Source guard requires those terms and rejects Android-only vocabulary. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Phase 16 API regression gate | `pnpm -F @home-ktv/api test -- src/test/real-mv-policy.test.ts src/test/admin-imports-routes.test.ts src/test/seed-demo-song.test.ts src/test/online-candidate-task.test.ts src/test/admin-online-task-actions.test.ts src/test/room-queue-commands.test.ts src/test/phase-16-boundary-guards.test.ts src/test/real-mv-domain-contracts.test.ts src/test/real-mv-media-contracts.test.ts src/test/real-mv-playback-flow.test.ts src/test/real-mv-admission-regression.test.ts` | 38 files, 241 tests passed | PASS |
| Phase 16 Admin regression gate | `pnpm -F @home-ktv/admin test -- src/test/real-mv-review-ui.test.tsx src/test/song-catalog.test.tsx` | 7 files, 39 tests passed; existing non-fatal `--localstorage-file` warnings only | PASS |
| Real-MV hardening script tests | `node --test scripts/real-mv-playback-risk-spike.test.mjs` | 4/4 tests passed | PASS |
| Controlled hardening report | `pnpm real-mv:risk-spike -- --controlled-only --output /tmp/real-mv-phase16-controlled.md` | Report written to `/tmp/real-mv-phase16-controlled.md` | PASS |
| API typecheck | `pnpm -F @home-ktv/api typecheck` | exit 0 | PASS |
| Admin typecheck | `pnpm -F @home-ktv/admin typecheck` | exit 0 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `HARD-01` | `16-01`, `16-04` | Review-first admission remains default; auto-admit eligibility is reserved metadata only. | SATISFIED | Policy helper, candidate metadata, negative Admin UI/source guard, no admission-service operational read. |
| `HARD-02` | `16-03`, `16-04` | Real-MV behavior covered by representative two-track and unsupported cases. | SATISFIED | Local hardening script, API real-MV media/playback/admission tests, platform-neutral final regression. |
| `HARD-03` | `16-02`, `16-04` | Demo/local songs, online supplement tasks, queue controls, and Admin maintenance remain compatible. | SATISFIED | Seed demo, online task, room queue command, Admin online action, and Admin song catalog tests. |

### Anti-Patterns Found

One source-guard bug was found during verification: `phase-16-boundary-guards.test.ts` lowercased the scanned source but compared against literal `autoAdmit`, which would miss a lowercased match. It was fixed in `4aa57d0` and re-tested.

### Human Verification

No human-only verification is required for Phase 16. Browser/native device playback support remains runtime-gated and future Android TV implementation remains out of scope for v1.2.

### Gaps Summary

No blocking gaps remain. Phase 16 achieved its goal: review-first policy is preserved, reserved auto-admit metadata is inert, local hardening evidence is portable, legacy flows remain covered, and Android TV remains a future contract boundary rather than a v1.2 runtime implementation.

---

_Verified: 2026-05-13T13:47:45.690Z_
_Verifier: Codex inline verification_
