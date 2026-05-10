# Feature Research: v1.2 热门歌曲候选名单

**Researched:** 2026-05-10
**Scope:** Single-run ranked recommendation artifact only.

## Product Shape

The user runs one command and receives a ranked, explainable list answering: **哪些歌值得我之后下载/补入歌库？** The output is a review checklist, not an acquisition workflow.

## Table Stakes

### Source Ingestion

- Source manifest lists source id, name, class, URL/file path, parser, weight, freshness policy, and expected row counts.
- Manual snapshot support covers image-heavy or app-only KTV sources such as CAVCA 金麦榜 and possible 汽水 exports.
- Public adapters parse high-value sources such as QQ `K歌金曲榜` and selected QQ/酷狗/网易云 support charts.
- Source health report shows parsed/failed/stale/skipped sources with row counts and warnings.

### Normalization And Dedupe

- Preserve raw source title/artist, display title/artist, canonical keys, and source evidence.
- Merge only obvious same-song rows by title + artist identity.
- Same-title different-artist songs stay separate.
- Variant markers such as Live, DJ, Remix, 伴奏, 翻唱, 片段, 女声版, 男声版 become warnings/penalties.
- Candidate IDs and canonical keys remain stable for future weekly diffing and OpenList matching.

### Scoring And Ranking

Use deterministic scoring:

```text
score =
  ktvIntent(0-40)
  + crossSourceConsensus(0-25)
  + freshnessTrend(0-15)
  + metadataConfidence(0-10)
  - penalties(0-30)
```

KTV/K歌 evidence should outrank streaming-only heat. Consensus counts source classes, not duplicate rows from one provider. Output should expose the score breakdown and rank into `A-优先补歌`, `B-可考虑`, `C-观察`, and `D-不建议/排除`.

### Exports And CLI

Default output directory:

```text
.planning/reports/hot-songs/<YYYY-MM-DD-HHmm>/
```

Default files:

```text
hot-song-candidates.md
hot-song-candidates.csv
hot-song-candidates.json
source-report.json
```

CSV should be human-reviewable. JSON should preserve schema version, run metadata, source statuses, candidate IDs, canonical keys, score breakdowns, warnings, and all source evidence.

## Anti-Features

- OpenList matching.
- Downloads or download URLs.
- Weekly comparison/history diff.
- Background scheduler.
- Admin UI review.
- Login/private API scraping.
- OCR automation.
- Auto-import or DB mutation.

## Feature Dependencies

```text
Source manifest
  -> Source adapters / manual snapshots
    -> Source rows
      -> Normalization
        -> Dedupe groups
          -> Score breakdown
            -> Markdown / CSV / JSON exports
```
