# Pitfalls Research: v1.2 真实 MV 歌库

**Researched:** 2026-05-10
**Scope:** Risks when adding real MKV/MPG MV ingestion
**Confidence:** High for risk categories, medium for actual file-library conventions

## Critical Pitfalls

### Treating Extension As Playback Proof

**Risk:** MKV/MPG files can be scanned but still fail in the browser TV runtime because of container, codec, MIME, byte-range, seek, or device limitations.

**Prevention:** Store separate ingest, compatibility, and queueability states. Validate MIME/range serving. Add representative playback smoke tests before marking assets playable.

### Assuming Browser Track Switching Works

**Risk:** `HTMLMediaElement.audioTracks` is not consistently available across browsers, so in-file original/accompaniment switching may not work on the web TV.

**Prevention:** Treat audio-track switching as a runtime capability. Hide switch controls or show a clear unsupported state when the TV runtime cannot switch tracks. Keep dual logical assets in the data model so Android TV can later implement this cleanly.

### Confusing Track Index With Vocal Role

**Risk:** Track 0/1 order, language, and labels vary by source. Automatically assuming "track 0 original, track 1 accompaniment" can admit wrong songs.

**Prevention:** Preserve raw track facts and require Admin confirmation for role mapping unless confidence is explicit and reviewable.

### Sidecar Conflict

**Risk:** MediaInfo, filename, sibling `song.json`, and Admin edits can disagree.

**Prevention:** Define precedence and provenance. Show conflicts in Admin review. Make Admin-confirmed fields the formal catalog truth.

### Partial Copy And Heavy Scan

**Risk:** Large MV files may be copied into the media root while the scanner is watching, causing failed or expensive probes.

**Prevention:** Require file stability before probing, cache probe output by file identity, cap probe concurrency/timeouts, and keep manual rescan/reconcile available.

### False Android Readiness

**Risk:** Adding track and media profile fields may be mistaken for Android TV support.

**Prevention:** Store Android compatibility as unknown/candidate only. Keep Android TV native playback explicitly out of v1.2.

## Phase Implications

| Phase | Pitfall To Address | Acceptance Signal |
|-------|--------------------|-------------------|
| Contract/schema spike | Browser playback and track switching uncertainty | Fixtures prove load/seek and clearly mark unsupported switching |
| Scan/probe/sidecars | Partial files, sidecar misattachment, MediaInfo ambiguity | Candidate provenance and stability checks are visible |
| Admin review/admission | Wrong title/artist/track-role admission | Admin can correct and confirm before catalog entry |
| Playback integration | Controls shown without capability | Mobile/TV only expose switching when supported |
| Hardening | Auto-admit and Android assumptions leak into scope | Policies default to review-first and Android remains reserved |

## Looks Done But Is Not

- Files appear in the candidate list but cannot be played or seeked.
- TV can play a file once but cannot switch or recover after skip.
- Admin shows two tracks but does not preserve which source track maps to which KTV role.
- Search exposes unsupported files.
- `song.json` writes a pretty title but loses technical metadata needed to reproduce admission.
- Auto-admit imports files without review by default.

## Sources

- MDN `audioTracks`: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/audioTracks
- MDN `canPlayType()`: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/canPlayType
- Node.js `fs.watch`: https://nodejs.org/api/fs.html
- MediaInfo: https://mediaarea.net/en/MediaInfo
- Android Media3 supported formats: https://developer.android.com/media/media3/exoplayer/supported-formats
