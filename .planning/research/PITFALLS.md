# Pitfalls Research: v1.2 热门歌曲候选名单

**Researched:** 2026-05-10
**Scope:** Public chart/list metadata in, ranked review artifacts out.

## Guardrails

- Metadata only.
- No media downloads, private accounts, cookies, CAPTCHA bypasses, OpenList matching, scheduler, or historical comparison.
- The generated list is a review artifact, not proof that media exists locally or can be played.

## Risks And Mitigations

| Risk | Phase | Mitigation |
|------|-------|------------|
| Public chart pages change or return partial/login/app-gated content | Phase 12 | Use source manifest, schema validation, expected row counts, timeouts, and source health report. |
| A failed source silently biases the list | Phase 12 | Per-source status must show `ok/degraded/failed/skipped`, row count, warnings, and failure reason. |
| Tool crosses public-access boundary | Phase 12 | Reject cookies/auth headers/private-token configs in v1.2 defaults. Mark auth-only sources deferred. |
| Chinese title normalization creates false duplicates | Phase 13 | Preserve raw/display/canonical fields; keep version tags and bracket descriptors visible. |
| Same-title different-artist songs collapse | Phase 13 | Require title + artist identity for high-confidence merges; emit merge confidence. |
| Pinyin/initials are used as duplicate proof | Phase 13 | Use pinyin only as auxiliary review/search signal, never as sole identity key. |
| Live/DJ/remix/cover/伴奏 versions pollute top recommendations | Phase 13/14 | Detect variant markers and apply warnings or penalties. |
| Streaming charts dominate KTV-specific demand | Phase 14 | Cap per-source contribution and score KTV intent separately from generic popularity. |
| Equal-score rows reorder between runs | Phase 14 | Use integer scoring and explicit deterministic tie-breakers. |
| Output looks authoritative without enough evidence | Phase 14 | Include score breakdown, source summary, warnings, and source health in Markdown/CSV/JSON. |

## Required Test Fixtures

- Simplified/traditional variants such as `後來` / `后来`.
- Full-width/half-width and punctuation variants.
- Mixed titles such as `Run Wild（向风而野）`.
- OST descriptors such as `等你的季节 《步步惊心》电视剧插曲`.
- Variant titles such as `同手同脚 (Live)` and `若不是因为你 (深情版)`.
- Multi-artist separators such as `A/B`, `A、B`, `A feat. B`.
- Same title with different artists.

## Phase Gates

- Phase 12 must make source failures visible before scoring exists.
- Phase 13 must prove conservative dedupe before ranking exists.
- Phase 14 must prove deterministic exports and no mutation of KTV runtime state before the milestone can be accepted.
