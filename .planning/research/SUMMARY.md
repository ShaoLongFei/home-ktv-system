# Research Summary: v1.2 热门歌曲候选名单

**Synthesized:** 2026-05-10
**Scope:** Single-run ranked candidate list generator for future KTV resource downloads.

## Key Findings

- Build a root-level TypeScript CLI, not an API feature.
- KTV-specific evidence should outrank streaming-only popularity.
- QQ 音乐 `K歌金曲榜` is the strongest automated K歌 signal found.
- CAVCA `金麦榜` is the strongest official KTV-industry source, but ranked rows are image-based, so v1.2 should support manual snapshot input instead of OCR.
- QQ/酷狗/网易云 general charts are useful as support signals.
- 汽水音乐 should be deferred or handled by manual snapshot unless the user provides a stable public chart URL/export.
- Normalize conservatively and preserve raw source evidence.
- Use deterministic explainable scoring and emit Markdown/CSV/JSON/source-report artifacts.

## Recommended Stack

- `tsx` root script.
- Native Node `fetch`, `parseArgs`, and filesystem APIs.
- `cheerio` for HTML parsing.
- `csv-stringify` for CSV output.
- `zod` for source/config validation.

## Roadmap Shape

1. Source contracts and fetch harness.
2. Normalization and dedupe.
3. Scoring, exports, and CLI verification.

## Boundaries

Do not implement OpenList matching, downloads, weekly comparison, scheduler, Admin UI, OCR, DB/catalog mutation, or private/login scraping in v1.2.

---
*Sources: `.planning/research/STACK.md`, `.planning/research/FEATURES.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`.*
