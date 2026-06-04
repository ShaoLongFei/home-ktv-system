# Music Metadata Sidecar Design

## Goal

Improve both song cover fetching and LLM style tagging by introducing a local Node metadata sidecar that consolidates the most useful behavior from the researched music projects:

- `NeteaseCloudMusicApiBackup`
- `Meting`
- `KuGouMusicApi`

The Python batch scripts remain the orchestrators. The sidecar becomes the shared metadata source for cross-platform song search, cover-oriented detail lookup, and tag-enrichment hints.

## Current Problems

### `fetch_song_covers.py`

- Platform requests are implemented independently in Python, with duplicated request/header/detail logic.
- Candidate enrichment is uneven across providers. `netease` has a detail fallback, but `qq`, `kugou`, and `kuwo` are still weaker than the researched implementations.
- Provider calls are done inside Python request code paths, which makes it hard to share metadata caches across cover-fetching and tagging.
- The script already has matching logic that is good enough to keep, but its inputs are poorer than they should be.

### `run_style_tagging_llm_batch.py`

- The LLM currently sees only `title + primary_artist_name`.
- The script ignores rich local hints already available in the library row, such as:
  - `artist_names`
  - `file_name`
  - `relative_path`
- The script also ignores externally discoverable metadata such as album name, normalized multi-artist names, and provider source.
- This lowers tag quality and increases unnecessary LLM ambiguity.

## Chosen Approach

Use a local long-lived Node sidecar over JSONL stdin/stdout instead of directly embedding more provider logic into the Python scripts.

Why this approach:

1. It keeps Python focused on batch control, scoring, persistence, and retry behavior.
2. It allows one shared metadata implementation to serve both cover fetching and style tagging.
3. It reuses the best parts of the researched Node ecosystems without making the committed Python scripts depend on ignored `runtime/` research directories at runtime.
4. It gives us a clean place to add provider-level caching and normalization once.

## Architecture

### Node sidecar

New script:

- `scripts/tools/music_metadata_sidecar.mjs`

Responsibilities:

- Read JSONL requests from stdin
- Dispatch asynchronous provider lookups
- Return JSONL responses with matching request IDs
- Cache repeated provider/search/detail lookups for the life of the process
- Normalize output into one stable shape

Protocol shape:

Request:

```json
{"id":"1","command":"searchCandidates","input":{"provider":"kugou","title":"夜曲","artist":"周杰伦","limit":8}}
```

Response:

```json
{"id":"1","ok":true,"result":{"provider":"kugou","candidates":[{"provider":"kugou","providerSongId":"...","title":"夜曲","artistNames":["周杰伦"],"albumName":"叶惠美","imageUrl":"..."}]}}
```

Initial commands:

- `searchCandidates`
- `bestMetadata`
- `health`

### Provider strategy

#### NetEase

- Primary: local `NeteaseCloudMusicApiBackup`
- Keep current deployment model
- Preserve current `/cloudsearch` + `/song/detail` flow

#### QQ / Tencent

- Use the `Meting`-style search and album-cover rules as the baseline behavior
- Normalize search rows and derive cover URLs from album mids

#### Kuwo

- Use the `Meting`-style `searchMusicBykeyWord` + `musicInfo` detail pattern
- Prefer detail picture fields when present

#### Kugou

- Use the researched `KuGouMusicApi` patterns as the primary reference
- Keep current mobile search as the discovery entry
- Improve detail/cover resolution with the richer Kugou-oriented image/detail behavior derived from:
  - `search.js`
  - `images_audio.js`
  - `krm_audio.js`

### Python cover script changes

`fetch_song_covers.py` will:

- start one sidecar process per run
- use the sidecar for `netease / tencent / kugou / kuwo`
- keep Spotify in Python for now
- keep the existing Python candidate scoring and download/writeback path

This is deliberate. The current matching heuristics are already tested and good enough; the main improvement is better input data.

### Python style-tagging changes

`run_style_tagging_llm_batch.py` will:

- read more local fields from `ktv_songs`
- optionally call the sidecar for `bestMetadata`
- build richer prompt rows per song:
  - title
  - primary artist
  - all artists
  - file name
  - relative path
  - matched provider source
  - matched album name
  - matched external artists
- add lightweight rule-based hint extraction from title/path/version words

The LLM remains the final classifier. The sidecar only reduces ambiguity and raises hit quality.

## Data Contracts

### Sidecar candidate row

```json
{
  "provider": "kuwo",
  "providerSongId": "123",
  "title": "夜曲",
  "artistNames": ["周杰伦"],
  "albumName": "十一月的萧邦",
  "imageUrl": "https://...",
  "rawScore": 0
}
```

### Tag enrichment row

The Python tagger will extend each prompt row with optional metadata:

```json
{
  "id": "1",
  "title": "夜曲",
  "artistName": "周杰伦",
  "artistNames": ["周杰伦"],
  "fileName": "周杰伦-夜曲(MTV)-国语-流行.mkv",
  "relativePath": "流行歌曲/推荐0019/周杰伦-夜曲(MTV)-国语-流行.mkv",
  "matchedProvider": "netease",
  "matchedAlbumName": "十一月的萧邦",
  "matchedArtistNames": ["周杰伦"],
  "derivedHints": ["国语", "流行"]
}
```

## Error Handling

- If the sidecar cannot start, Python scripts should fall back to existing direct logic where feasible.
- If one provider fails, that provider should be recorded as failed without aborting the whole batch.
- If `bestMetadata` fails during tagging, the script should continue with local-only prompt context.
- Sidecar responses must always be bounded, JSON-only, and keyed by request ID.

## Testing Strategy

### Node

Add `node --test` coverage for:

- JSONL request/response protocol
- provider normalization helpers
- candidate selection for `bestMetadata`
- cache reuse on repeated requests

### Python cover script

Add tests for:

- sidecar client fallback behavior
- sidecar-backed provider search integration
- preserving existing Spotify behavior

### Python style tagging

Add tests for:

- richer candidate SQL selection fields
- enriched prompt payload shape
- derived hint extraction
- graceful fallback when sidecar metadata is unavailable

## Scope Boundaries

Included:

- local Node sidecar
- Python client integration
- cover metadata improvement
- tag prompt enrichment

Not included in this pass:

- replacing Spotify handling
- storing remote metadata in database tables
- changing `style_tags` storage schema
- introducing a permanent HTTP service or systemd unit for the sidecar

## Recommendation

Implement the sidecar as a committed `scripts/tools/*.mjs` utility with zero external runtime dependencies, using the researched projects as protocol and endpoint references rather than as untracked runtime imports. That keeps the branch reproducible and deployable.
