# Pitfalls Research

**Domain:** Single-room home living-room KTV system with mixed local/online songs, phone control, and TV playback
**Researched:** 2026-04-28
**Confidence:** MEDIUM

## Critical Pitfalls

### Pitfall 1: Making online songs part of the primary playback path

**What goes wrong:**
Projects wire the TV player directly to third-party URLs or downloader output and treat online songs like normal local assets. Playback becomes dependent on provider uptime, extractor breakage, network jitter, changing formats, and policy constraints. The result is a system that demos well once but fails unpredictably in normal use.

**Why it happens:**
It looks faster than building a proper local library and cache lifecycle, and many karaoke/open-source media stacks make search-plus-play appear trivial at prototype time.

**How to avoid:**
Make the product work fully with local songs first. Treat online sources as a separate discovery/import layer with explicit capability flags, manual review where rights are unclear, and a cache lifecycle that produces the same internal `Asset` shape as local media before playback. Keep online support kill-switchable without breaking the room.

**Warning signs:**
- Playback testing depends on external URLs more often than NAS-backed files.
- Provider-specific IDs or URLs leak into queue entries, player commands, or UI state.
- A provider outage or extractor update can block normal singing.
- The team says “we can just stream it for now” late into MVP planning.

**Phase to address:**
Phase 1: Product boundaries and media contract
Phase 5: Online provider layer, compliance gate, and cache lifecycle

---

### Pitfall 2: Skipping a canonical `Song` / `Asset` split and relying on filenames or provider IDs

**What goes wrong:**
Local songs, online candidates, original/instrumental variants, and multiple video versions get flattened into one loose record. Duplicate songs proliferate, queue entries point to unstable resources, and features like “prefer instrumental”, “show versions”, or “promote cached song to library” require rewrites.

**Why it happens:**
Early prototypes often model “a song” as “whatever file or URL will play”, which is enough for a small hand-curated set but breaks as soon as mixed sources and multiple versions appear.

**How to avoid:**
Freeze the domain model early: `Song` is what users request, `Asset` is what the player consumes, and `SourceRecord` tracks provenance and verification. Put vocal mode, subtitle mode, checksum, duration, and lifecycle on assets. Never let filename parsing or provider metadata become the long-term source of truth.

**Warning signs:**
- The same title/artist appears as separate local and online songs in search.
- Queue rows store raw file paths or external URLs directly.
- Original/instrumental switching depends on string matching like “伴奏” in filenames.
- “Promote this online song to local library” needs bespoke one-off code.

**Phase to address:**
Phase 1: Domain model and metadata contract
Phase 2: Library ingest, normalization, and search indexing

---

### Pitfall 3: Underestimating import hygiene and building on dirty media

**What goes wrong:**
Teams assume media files can be scanned straight into the playable catalog. In reality, filenames are inconsistent, durations mismatch, subtitles vary, and some files are broken or mislabeled. Without an import/review boundary, the library becomes polluted and every later feature inherits bad data.

**Why it happens:**
KTV content looks like “just files on disk”, so ingestion work is mistaken for simple filesystem enumeration instead of a domain pipeline.

**How to avoid:**
Separate raw import from formal library admission. Require a `song.json`-style metadata truth source for normalized library entries, keep `imports/pending`, `needs-review`, and `rejected` stages, and add explicit checks for codec support, duration sanity, vocal mode certainty, and subtitle presence before songs become queueable.

**Warning signs:**
- The catalog is populated directly from arbitrary folder names.
- There is no “review required” state for uncertain media.
- Broken or low-quality files are discovered only during playback.
- Search quality depends on manual renaming habits rather than structured metadata.

**Phase to address:**
Phase 2: Local library ingest, review workflow, and metadata normalization
Phase 6: Admin tooling for import audit and repair

---

### Pitfall 4: Letting control commands or player state bypass a single session engine

**What goes wrong:**
Phones optimistically mutate queue state, the TV infers its own truth from local playback, and reconnects create divergent views of what is playing, what failed, and what comes next. Skip, top-queue, remove, replay, and failure recovery become race-prone.

**Why it happens:**
For a single-room product, it is tempting to treat real-time coordination as “simple enough” and let clients own part of the state.

**How to avoid:**
Make the backend session engine the only authority for queue state, playback target, versions, and failure transitions. Commands should be versioned, TV updates should be acknowledgements not truth mutations, and reconnect should always converge from server state. Design failure states and player heartbeats from the start, not as logging afterthoughts.

**Warning signs:**
- Mobile UI updates before server acknowledgement.
- TV player can advance independently without a server-issued next target.
- Reconnect logic depends on “best guess” local state.
- Queue bugs are described as “timing issues” or “rare race conditions”.

**Phase to address:**
Phase 3: Session engine, command protocol, and realtime sync
Phase 4: Player acknowledgement and recovery loop

---

### Pitfall 5: Treating TV playback as ordinary browser video instead of a constrained runtime

**What goes wrong:**
The player works on a laptop but fails on the actual TV or kiosk browser because of autoplay restrictions, codec support differences, poor buffering behavior, visible transition gaps, or AV sync issues with the room audio chain. This is one of the fastest ways to miss MVP despite having “most features done”.

**Why it happens:**
Web teams assume a `<video>` tag plus full-screen UI is enough, and delay real device testing until late.

**How to avoid:**
Choose one constrained playback standard early: browser-friendly H.264 + AAC, hard-sub video as the default, preload/next-track strategy, and on-device validation on the actual TV/browser stack. Add explicit latency calibration, player heartbeats, and failure reporting. Treat autoplay unlock and codec qualification as acceptance criteria, not polish.

**Warning signs:**
- Playback validation happens on desktop browsers instead of the TV target.
- Songs require user interaction to start after page load or reconnect.
- Different TVs or browsers behave differently for the same file.
- Audio arrives noticeably ahead of or behind video once connected to the room sound chain.

**Phase to address:**
Phase 4: TV player runtime, device validation, codec contract, and AV calibration

---

### Pitfall 6: Smuggling advanced media features into the MVP path

**What goes wrong:**
Pitch shift, live vocal switching, external lyrics, soft subtitles, dual-track routing, audio normalization, or browser-side transforms get mixed into the core playback path too early. This increases transcode latency, asset variance, and failure modes before the base product can reliably play one song after another.

**Why it happens:**
These features feel “KTV-like”, so teams treat them as table stakes instead of multipliers on playback complexity.

**How to avoid:**
Constrain MVP media capabilities aggressively: local video assets, hard subtitles, playback-time choice between already-prepared original/instrumental assets, and no software DSP. Keep schema fields for future expansion, but do not let unsupported capabilities alter the main queue or player logic.

**Warning signs:**
- The first implementation needs ffmpeg transforms at play time.
- “Original/instrumental switch” assumes seamless in-song toggling.
- The player code branches heavily on subtitle mode or track layout.
- Bugs are blocked on “future media flexibility” rather than the current contract.

**Phase to address:**
Phase 1: MVP capability boundaries
Phase 4: Player scope lock and playback contract verification

---

### Pitfall 7: Shipping without operator-facing recovery surfaces

**What goes wrong:**
When scans misclassify songs, cache jobs fail, provider mappings go stale, or the TV player drops, the only way to recover is by shell access or database edits. The product feels fragile even when the core architecture is sound because routine repair is too expensive.

**Why it happens:**
Teams treat admin/review tooling as post-MVP, but this domain constantly produces messy edge cases in media and playback state.

**How to avoid:**
Include minimal admin flows in the roadmap: review import candidates, inspect failed playback/cache jobs, rebind or inspect devices, rotate pairing tokens, and manually promote or reject online candidates. Log recovery-relevant facts, not just stack traces.

**Warning signs:**
- The only diagnosis path is reading raw logs.
- Failed songs remain in the queue with no actionable reason exposed.
- Import corrections require renaming files and rescanning blindly.
- TV/player pairing conflicts cannot be resolved without service restarts.

**Phase to address:**
Phase 6: Admin tooling, observability, and operator recovery

---

### Pitfall 8: Treating QR entry and device binding as a trivial convenience feature

**What goes wrong:**
Permanent room URLs, long-lived QR codes, or weak device role boundaries make it easy to join the wrong room, reuse stale tokens, or confuse multiple TV players. In a family-room product this shows up as control conflicts and “why is my phone controlling the wrong screen?” rather than classic enterprise security incidents.

**Why it happens:**
Single-room scope creates false confidence that pairing can be left informal.

**How to avoid:**
Use TV strong binding and mobile light binding. QR codes should carry room context plus a short-lived pairing token; controller sessions should outlive QR validity but be separate credentials; only one active TV player should own the room; and conflict states should be explicit in both backend and UI.

**Warning signs:**
- The QR code is effectively a permanent URL.
- Any device can impersonate the TV player role.
- Refreshing the mobile page often loses or duplicates control state.
- Two player instances can attach silently to the same room.

**Phase to address:**
Phase 3: Room/session identity model
Phase 6: Device management and conflict handling

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Directly queue external URLs | Fast demo with online songs | Provider outages, extractor drift, no stable recovery path | Never |
| Derive metadata entirely from filenames | Minimal upfront schema work | Dirty search, duplicate songs, fragile variant handling | Only for raw import staging, never for canonical library |
| Make the TV infer queue state locally | Fewer backend concepts at first | State drift, broken reconnect, race-prone skip/remove flows | Never |
| Support soft subtitles and external lyrics in MVP | Broader format compatibility | Large playback matrix, sync bugs, more QA surface | Only as dormant schema fields, not active playback modes |
| Skip admin review UI and “fix later” | More user-facing features sooner | Every media edge case requires shell/database access | Never in this domain |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Online providers | Assuming search results imply download/cache rights and stable playback URLs | Separate discovery from import/playback, record provider capabilities, and require review for uncertain sources |
| NAS / shared storage | Using player-host-relative paths or inconsistent mounts | Standardize canonical storage paths and verify player-visible paths during ingest, not at play time |
| Browser/TV runtime | Testing on desktop Chrome only | Validate on the actual TV/browser stack for autoplay, codec support, buffering, and reconnection |
| Mobile realtime channel | Using WebSocket as both transport and state truth | Use server-side session versioning and let WebSocket carry commands/events around authoritative state |
| Media probes | Trusting one successful ffprobe result as “ready” | Also verify browser-playable codec/container, subtitle mode, duration sanity, and asset role certainty |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full library rescans as the normal update path | Import lag, duplicated entries, long “refresh library” cycles | Track `mtime`, size, checksums, and support incremental scans with explicit review queues | Usually once the library reaches a few hundred songs or frequent imports |
| On-demand transcode or transform during playback | Long first-play waits, stutter, CPU spikes, skipped songs | Pre-normalize accepted assets and keep runtime playback dumb | Immediately on modest home hardware |
| Search built from naive `LIKE` queries and unnormalized text | Chinese, pinyin, initials, and aliases miss or rank badly | Normalize metadata, index search fields separately, and fix ranking rules early | Noticeable well before 1,000 songs |
| Unbounded online cache retention | NAS fills silently, stale assets crowd valid ones | Give cached assets lifecycle states, TTL/review policy, and purge controls | As soon as online fallback is used regularly |
| No player preload/next-target strategy | Black frames or long gaps between songs | Preload the next validated asset and make transition behavior part of player protocol | Immediately visible in living-room use |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Permanent QR codes or room URLs with no expiring token | Anyone who once saw the screen can rejoin later and control playback | Use short-lived room-bound pairing tokens plus separate controller sessions |
| Treating TV and mobile as interchangeable device roles | Rogue or accidental player conflicts, incorrect room ownership | Strongly bind TV player identity and allow only one active player per room |
| Storing third-party source URLs as durable playback secrets | Link leakage and brittle replay assumptions | Convert accepted media into controlled local assets before normal playback |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Exposing “search everything” before search normalization is reliable | Users see duplicates, wrong versions, and low trust in the catalog | Keep the result model clean first: strong exact matches, alias support, version clarity, then richer discovery |
| Showing controls for unsupported asset states | Users tap original/instrumental or switch features that cannot work for the current song | Render controls from explicit asset capability flags, not hopeful defaults |
| Hiding playback/cache/import failures behind generic errors | Users keep retrying without understanding whether the issue is source, file, or player | Surface actionable reason categories and fallback suggestions in mobile/admin UI |
| Making TV pairing flow depend on remote control interaction | Extra friction before anyone can even point a phone at the system | Keep QR entry continuously or contextually visible on the TV itself |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Local library import:** Often missing review states and codec validation — verify uncertain songs do not become queueable by default.
- [ ] **Online fallback:** Often missing provider kill-switch, stale detection, and rights boundary — verify the room still works with all online features disabled.
- [ ] **TV player:** Often missing autoplay unlock, real-device codec testing, and AV calibration — verify on the actual living-room display and audio chain.
- [ ] **Realtime control:** Often missing versioned commands and reconnect convergence — verify two phones plus one TV can recover cleanly after disconnects.
- [ ] **Search:** Often missing alias, pinyin, initials, and duplicate control — verify common Chinese search patterns on a non-trivial seed catalog.
- [ ] **Ops surface:** Often missing repair workflows — verify an operator can fix a bad import, a failed cache job, and a player conflict without shell access.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Online playback path leaked into core flow | HIGH | Freeze online queueing, add provider capability flags, migrate queued/provider-linked assets to controlled local asset records, and revalidate playback only from accepted assets |
| Dirty library polluted the canonical catalog | HIGH | Stop automatic admissions, introduce import/review states, re-run normalization on the library, merge duplicates at the `Song` layer, and quarantine low-confidence assets |
| Session truth drift between phone and TV | HIGH | Move queue/playback state ownership fully server-side, add version checks and heartbeats, then replay reconciliation tests with multiple controllers |
| TV runtime incompatibility on target hardware | MEDIUM | Narrow accepted media formats, add device-specific playback qualification, and retest on the actual TV/browser before re-expanding format support |
| Pairing/device conflicts | MEDIUM | Rotate pairing tokens, invalidate stale controller sessions, enforce one active TV player per room, and add explicit conflict UI plus admin reset |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Online songs as primary path | Phase 1 and Phase 5 | Disable online providers and confirm local-only flow still satisfies core singing loop |
| Missing `Song` / `Asset` split | Phase 1 and Phase 2 | Queue the same song from local and online-candidate paths and confirm they resolve to one canonical song model with distinct assets |
| Dirty import pipeline | Phase 2 | Seed malformed, duplicate, and incomplete media and confirm only reviewed/valid assets become playable |
| No single session engine | Phase 3 | Run two phones and one TV through queue, skip, remove, reconnect, and failure scenarios without divergent state |
| TV runtime treated as generic browser video | Phase 4 | Validate autoplay, codec support, preload gap, failure reporting, and AV sync on the actual TV stack |
| Advanced media features in MVP path | Phase 1 and Phase 4 | Confirm the MVP playback contract excludes runtime transforms and only accepts supported asset modes |
| No operator recovery surfaces | Phase 6 | Resolve a failed import, stale online candidate, and player conflict from admin tooling alone |
| Weak QR/device binding | Phase 3 and Phase 6 | Verify expiring pairing, persistent controller session behavior, and single-active-player enforcement |

## Sources

- Internal project scope: [PROJECT.md](../PROJECT.md)
- Internal architecture: [KTV-ARCHITECTURE.md](../../docs/KTV-ARCHITECTURE.md)
- Karaoke Eternal FAQ: https://www.karaoke-eternal.com/faq/
- Karaoke Eternal app docs: https://www.karaoke-eternal.com/docs/karaoke-eternal-app/
- PiKaraoke FAQ & troubleshooting: https://github.com/vicwomg/pikaraoke/wiki/FAQ-%26-Troubleshooting
- PiKaraoke Bluetooth AV sync notes: https://github.com/vicwomg/pikaraoke/wiki/Bluetooth-Audio-Video-Sync
- PiKaraoke repository/README: https://github.com/vicwomg/pikaraoke
- Chrome autoplay policy: https://developer.chrome.com/blog/autoplay/
- YouTube API Services Developer Policies: https://developers.google.com/youtube/terms/developer-policies
- YouTube Terms of Service: https://www.youtube.com/t/terms

---
*Pitfalls research for: single-room home KTV system*
*Researched: 2026-04-28*
