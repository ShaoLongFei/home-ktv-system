# Stack Research: v1.2 热门歌曲候选名单

**Researched:** 2026-05-10
**Scope:** Single-run metadata-only generator for ranked KTV song candidates.

## Recommendation

Build a root-level TypeScript CLI, not an API/worker feature. The tool fetches public chart/list metadata or reads manual snapshot files, normalizes rows, deduplicates candidates, scores them, and writes Markdown/CSV/JSON review artifacts. It must not touch the DB, OpenList, media files, import scanner, scheduler, or playback runtime.

## Stack

- Use Node built-in `fetch`, `node:util.parseArgs`, and `node:fs/promises`.
- Add root `tsx` so the script can run as TypeScript.
- Add `cheerio` for public HTML chart pages.
- Add `csv-stringify` for safe CSV output.
- Add `zod` for source manifest and adapter output validation.
- Reuse or mirror existing Chinese text normalization ideas from catalog search; do not use pinyin/initials as duplicate proof.

## Source Candidates

| Priority | Source | Access | Notes |
|----------|--------|--------|-------|
| P1 | QQ 音乐 `K歌金曲榜` | Public QQ chart page/API data | Strong automated K歌 signal. |
| P1 | CAVCA `金麦榜` | Official article + manual snapshot rows | Strongest KTV-industry signal, but rows are image-based; avoid OCR in v1.2. |
| P2 | QQ 热歌/流行指数/新歌/抖音热歌 | Public chart page/API data | General support signal. |
| P2 | 酷狗 TOP500/飙升/抖音热歌/粤语金曲 | Public HTML pages | Useful streaming and short-video support. |
| P3 | 网易云热歌/飙升/KTV唛榜 | Public HTML when accessible | Use as support; public API reliability varies. |
| P3 | 唱吧/51VV/KTVSky | Public pages/manual snapshots | KTV-adjacent, lower weight due metadata/freshness issues. |
| Deferred | 汽水音乐 | Manual export only unless official public chart URL is provided | No stable anonymous public web chart found. |

## Explicit Non-Goals

- No login cookies, private APIs, CAPTCHA bypass, mobile reverse engineering, or media download URLs.
- No OpenList matching, automatic downloads, weekly comparison, scheduler, OCR, Admin UI, DB writes, or catalog mutation.

## Sources

- CAVCA 金麦榜 index: https://www.cavca.org/news/49
- QQ 音乐 K歌金曲榜: https://y.qq.com/n/ryqq/toplist/36
- QQ 音乐榜单: https://y.qq.com/n/ryqq/toplist
- 酷狗排行榜: https://www.kugou.com/yy/rank/home
- 网易云榜单: https://music.163.com/discover/toplist
- 唱吧全国榜: https://changba.com/now/show/rank.php
- 51VV KTV 点唱榜: https://www.51vv.com/music/music_list_song.htm?curPage=1&songMenuID=277
- KTVSky 榜单: https://www.ktvsky.com/rank
