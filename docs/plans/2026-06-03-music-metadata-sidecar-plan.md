# Music Metadata Sidecar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a reusable local Node metadata sidecar and wire it into the cover-fetching and style-tagging Python tools so both scripts get better cross-platform metadata.

**Architecture:** A new `scripts/tools/music_metadata_sidecar.mjs` process exposes JSONL stdin/stdout commands for provider searches and best-match metadata lookup. `fetch_song_covers.py` and `run_style_tagging_llm_batch.py` each get a small Python client wrapper and fall back safely when the sidecar is unavailable.

**Tech Stack:** Node.js ESM, built-in fetch/process streams, Python 3 stdlib, existing project test runners (`node --test`, `python3 <testfile>`).

---

### Task 1: Lock sidecar protocol with failing Node tests

**Files:**
- Create: `scripts/tools/music_metadata_sidecar.test.mjs`
- Create: `scripts/tools/music_metadata_sidecar.mjs`

**Step 1: Write the failing test**

Add tests for:

- parsing a `searchCandidates` request
- returning normalized candidate rows
- selecting a best metadata row from multiple providers
- caching repeated logical requests

**Step 2: Run test to verify it fails**

Run: `node --test scripts/tools/music_metadata_sidecar.test.mjs`

Expected: FAIL because the sidecar script and helpers do not exist yet.

**Step 3: Write minimal implementation**

Implement:

- JSONL protocol reader/writer
- request dispatch by `command`
- pure helper exports for normalization and best-match selection
- in-memory cache map keyed by provider + normalized query

**Step 4: Run test to verify it passes**

Run: `node --test scripts/tools/music_metadata_sidecar.test.mjs`

Expected: PASS

### Task 2: Implement provider adapters inside the Node sidecar

**Files:**
- Modify: `scripts/tools/music_metadata_sidecar.mjs`
- Test: `scripts/tools/music_metadata_sidecar.test.mjs`

**Step 1: Write the failing test**

Add fixture-style tests for:

- NetEase normalization from local backup response
- Tencent cover derivation from album mid
- Kuwo detail picture resolution
- Kugou candidate normalization and detail-image fallback

**Step 2: Run test to verify it fails**

Run: `node --test scripts/tools/music_metadata_sidecar.test.mjs`

Expected: FAIL on missing provider behavior.

**Step 3: Write minimal implementation**

Implement provider handlers:

- `searchNeteaseCandidates`
- `searchTencentCandidates`
- `searchKuwoCandidates`
- `searchKugouCandidates`
- `bestMetadata`

Keep HTTP requests dependency-free and use the researched projects only as endpoint/header/reference models.

**Step 4: Run test to verify it passes**

Run: `node --test scripts/tools/music_metadata_sidecar.test.mjs`

Expected: PASS

### Task 3: Add a Python sidecar client for cover fetching

**Files:**
- Modify: `scripts/tools/fetch_song_covers_test.py`
- Modify: `scripts/tools/fetch_song_covers.py`

**Step 1: Write the failing test**

Add tests for:

- creating a sidecar client from CLI args
- using sidecar-backed provider search for at least one provider
- falling back to existing direct search when sidecar is disabled or errors

**Step 2: Run test to verify it fails**

Run: `python3 scripts/tools/fetch_song_covers_test.py`

Expected: FAIL because no sidecar client exists.

**Step 3: Write minimal implementation**

Add:

- CLI flags for sidecar enable/command or mode
- `NodeMetadataSidecarClient`
- lifecycle management for one shared sidecar process per run
- sidecar-backed provider search path for `netease,tencent,kugou,kuwo`

Keep Spotify on the current Python path.

**Step 4: Run test to verify it passes**

Run: `python3 scripts/tools/fetch_song_covers_test.py`

Expected: PASS

### Task 4: Add tag-enrichment tests before changing the LLM tagger

**Files:**
- Modify: `scripts/tools/run_style_tagging_llm_batch_test.py`
- Modify: `scripts/tools/run_style_tagging_llm_batch.py`

**Step 1: Write the failing test**

Add tests for:

- candidate SQL including `artist_names`, `file_name`, `relative_path`
- prompt rows including enrichment fields
- derived hints from title/path words
- fallback behavior when no sidecar metadata is returned

**Step 2: Run test to verify it fails**

Run: `python3 scripts/tools/run_style_tagging_llm_batch_test.py`

Expected: FAIL because the prompt and selection SQL are still narrow.

**Step 3: Write minimal implementation**

Implement:

- richer candidate selection SQL
- sidecar client reuse or a dedicated metadata lookup helper
- prompt builder changes
- lightweight regex-based hint extraction

**Step 4: Run test to verify it passes**

Run: `python3 scripts/tools/run_style_tagging_llm_batch_test.py`

Expected: PASS

### Task 5: Wire metadata enrichment into the live run paths

**Files:**
- Modify: `scripts/tools/fetch_song_covers.py`
- Modify: `scripts/tools/run_style_tagging_llm_batch.py`

**Step 1: Write the failing test**

Add tests that exercise the actual orchestration paths:

- cover probe path uses sidecar result
- coverage/fetch paths construct sidecar correctly
- tagging batch builds enriched rows for `complete_batch`

**Step 2: Run test to verify it fails**

Run:

- `python3 scripts/tools/fetch_song_covers_test.py`
- `python3 scripts/tools/run_style_tagging_llm_batch_test.py`

Expected: FAIL on orchestration gaps.

**Step 3: Write minimal implementation**

Thread the sidecar into:

- `find_cover`
- `probe_cover`
- `run_coverage`
- `complete_batch`

Ensure shutdown is explicit and exception-safe.

**Step 4: Run test to verify it passes**

Run:

- `python3 scripts/tools/fetch_song_covers_test.py`
- `python3 scripts/tools/run_style_tagging_llm_batch_test.py`
- `node --test scripts/tools/music_metadata_sidecar.test.mjs`

Expected: PASS

### Task 6: Update docs and verify command surfaces

**Files:**
- Modify: `scripts/tools/README.md`
- Modify: `docs/runbooks/song-cover-fetching.md`

**Step 1: Write the failing test**

Add or extend docs-contract assertions only if needed. If no docs-contract test exists for these flags, document directly without inventing one.

**Step 2: Run the relevant verification**

Run existing relevant tests only if touched. Otherwise verify with help text manually:

- `python3 scripts/tools/fetch_song_covers.py --help`
- `python3 scripts/tools/run_style_tagging_llm_batch.py --help`
- `node scripts/tools/music_metadata_sidecar.mjs --help`

Expected: new flags and sidecar usage are visible.

**Step 3: Write minimal implementation**

Document:

- what the sidecar does
- which providers it serves
- fallback behavior
- how cover and tagging scripts consume it

**Step 4: Run final verification**

Run:

- `node --test scripts/tools/music_metadata_sidecar.test.mjs`
- `python3 scripts/tools/fetch_song_covers_test.py`
- `python3 scripts/tools/run_style_tagging_llm_batch_test.py`

Expected: all green
