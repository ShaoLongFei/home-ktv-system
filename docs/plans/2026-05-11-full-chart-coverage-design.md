# Full Chart Coverage Design

## Problem

The hot-song generator currently proves the pipeline with tiny fixture samples, not production-sized chart data. Phase 12 fixture sources contain three rows per source and some live source thresholds are also set to three rows. That lets the workflow pass while producing a candidate list that is too small for real KTV acquisition decisions.

The corrected goal is source coverage: each requested chart should try to collect up to 500 rows, with 400 as the minimum success threshold unless the source itself proves a hard platform cap. Low row counts must be visible in `source-report.json`; they must not silently pass as healthy full sources.

## Scope

Add a decimal GSD phase, Phase 13.1, before Phase 14 ranking/export work. Phase 13.1 expands source ingestion and fixture reporting only. It does not score, rank, generate final CSV/Markdown exports, match OpenList files, trigger downloads, schedule jobs, mutate the KTV catalog/database, or add UI.

## Requested Sources

Kugou charts:

- 酷狗 TOP500
- 酷狗飙升榜
- 蜂鸟流行音乐榜
- 抖音热歌榜
- 快手热歌榜
- 内地榜
- 90后热歌榜
- 00后热歌榜

QQ Music charts:

- 腾讯音乐榜
- 巅峰潮流榜
- 飙升榜
- 热歌榜
- 流行指数榜
- 收藏人气榜
- 音乐指数榜
- 全民K歌
- 内地榜
- 网络歌曲榜
- 抖音热歌榜

NetEase Cloud Music charts:

- 热歌榜
- 飙升榜
- VIP 热歌榜

## Findings From Probe

Kugou public HTML pages expose chart IDs through the rank page navigation. `酷狗TOP500` is `8888` and paginates from `home/1-8888.html` through `home/23-8888.html`, yielding 500 rows. The other requested Kugou charts expose public rank IDs but currently return smaller platform totals in the public HTML probe: most 100 rows, 抖音热歌榜 32 rows.

QQ Music public `ToplistInfoServer.GetAll` lists standard QQ Music charts and reports totals such as 热歌榜 300, 飙升榜 100, 流行指数榜 100, K歌金曲榜 55, 内地榜 100, 网络歌曲榜 100, 抖音热歌榜 100. 腾讯音乐由你榜 is a separate Tencent Music chart app and exposes a list page with 200 rows through its app bundle/API flow. The named QQ sources that are not in `ToplistInfoServer.GetAll` need endpoint discovery and may require cookie or Playwright/XHR probing.

NetEase public playlist pages expose 热歌榜 `3778678` with 200 rows, 飙升榜 `19723756` with 100 rows, and 黑胶 VIP 热歌榜 `7785066739` with 10 rows. Reaching 400 for these likely requires additional endpoints, authenticated requests, or accepting a platform-cap warning.

## Architecture

Phase 13.1 will introduce a richer source definition layer for chart coverage:

- `targetRows`: desired row count, normally 500.
- `minRows`: minimum acceptable row count, normally 400.
- `platformCapRows`: optional detected or configured public cap.
- `segments`: optional list of pages/endpoints that belong to one logical chart.
- `auth`: optional environment variable name for a cookie header.
- `strategy`: adapter-specific strategy such as Kugou paged HTML, QQ toplist JSON, Tencent Music chart API, NetEase toplist HTML, or Playwright/XHR probe.

Adapters will return all rows for one logical chart with a single `sourceId`. The runner will write:

- `source-rows.json`: all rows across all sources.
- `sources/<sourceId>.json`: one file per requested chart source.
- `source-report.json`: row count, target/min threshold status, platform cap, strategy used, warnings, and errors.

## Fetch Strategy

The fetch order per source is:

1. Public no-login endpoint.
2. Same endpoint with optional cookie from an environment variable, if configured.
3. Optional Playwright/XHR probe for sources that remain below 400 and have no known platform cap.

Cookies are never committed, logged in full, or written into artifacts. Source reports may state that an auth retry was used, but they must redact secret values.

The implementation will not bypass CAPTCHA, defeat anti-bot systems, scrape private account-only personal data, or require copied proprietary app tokens. If a source blocks access or exposes fewer than 400 rows through acceptable methods, the report marks the source as below threshold with the actual evidence.

## Error Handling

Each source receives one of these health outcomes:

- `succeeded`: actual rows meet `minRows`.
- `platform_cap`: actual rows are below `minRows`, but the source reports or consistently exposes fewer rows than requested.
- `failed_below_min_rows`: actual rows are below `minRows` and no platform cap was established.
- `failed`: adapter/network/parse failure.
- `skipped`: disabled or source-filtered.

The whole run should fail only when no usable source remains, but `failed_below_min_rows` must be prominent in `source-report.json` and should fail fixture/live coverage tests for required sources.

## Test Strategy

Use TDD for adapter and runner changes:

- Add unit tests for Kugou pagination merging pages into one logical source.
- Add tests that thresholds detect `failed_below_min_rows` when rows are under 400.
- Add tests for per-source artifact writing under `sources/`.
- Add QQ/NetEase parser tests with fixture caps and status warnings.
- Add a probe/report test that proves secrets are redacted when cookie env vars are configured.

Live network checks will be optional commands because platform data changes. Fixture tests must be deterministic and committed.

## Acceptance Criteria

- The manifest contains the requested 8 Kugou, 11 QQ, and 3 NetEase logical chart sources.
- Every logical source has `targetRows=500` and `minRows=400` unless a stricter source-specific value is justified in the report.
- Kugou TOP500 fixture/live probe can collect 500 rows through pagination.
- Runs write `sources/<sourceId>.json` for each enabled source.
- Low-row sources are not silently marked healthy; the report distinguishes platform caps from failures.
- Optional cookie environment variables are supported and redacted.
- Existing Phase 13 normalization can consume the expanded `source-rows.json` without schema loss.
