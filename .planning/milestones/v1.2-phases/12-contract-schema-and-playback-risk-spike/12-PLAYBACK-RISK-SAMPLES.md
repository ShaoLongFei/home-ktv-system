# Phase 12 Playback Risk Sample Evidence

Generated at: 2026-05-12T04:12:57.106Z

Source samples:

- MKV sample: `songs-sample/关喆-想你的夜(MTV)-国语-流行.mkv`
- MPEG sample: `songs-sample/蔡依林-BECAUSE OF YOU(演唱会)-国语-流行.mpg`

## Browser capability

- canPlayType `video/x-matroska`: empty string
- canPlayType `video/mpeg`: empty string
- hasAudioTracksApi: false
- audioTrackSwitchMessage: current device does not support audio-track switching
- note: Chrome capability check returned no JSON result in this local run, so browser playback support remains unverified.

## MKV sample

Path: `songs-sample/关喆-想你的夜(MTV)-国语-流行.mkv`

Probe summary:

- container: `matroska,webm`
- durationMs: 286085
- videoCodec: `rv40`
- resolution: 720x480
- fileSizeBytes: 45893757
- audioTracks:
  - index: 1, id: `stream-1`, label: `Audio0`, language: `eng`, codec: `aac`, channels: 2
  - index: 2, id: `stream-2`, label: `Audio1`, language: `eng`, codec: `aac`, channels: 2

Playback risk:

- canPlayType: empty string
- hasAudioTracksApi: false
- compatibilityStatus: unsupported
- compatibilityReasons: `[{"code":"browser-cannot-play-type","severity":"error","message":"Current TV browser reports the media type unsupported","source":"runtime_spike"}]`
- switchingRisk: current device does not support audio-track switching

## MPEG sample

Path: `songs-sample/蔡依林-BECAUSE OF YOU(演唱会)-国语-流行.mpg`

Probe summary:

- container: `mpeg`
- durationMs: 280614
- videoCodec: `mpeg2video`
- resolution: 720x480
- fileSizeBytes: 88717312
- audioTracks:
  - index: 1, id: `0x1c0`, label: `Audio 1`, language: null, codec: `mp2`, channels: 2
  - index: 2, id: `0x1c1`, label: `Audio 2`, language: null, codec: `mp2`, channels: 2

Playback risk:

- canPlayType: empty string
- hasAudioTracksApi: false
- compatibilityStatus: unsupported
- compatibilityReasons: `[{"code":"browser-cannot-play-type","severity":"error","message":"Current TV browser reports the media type unsupported","source":"runtime_spike"}]`
- switchingRisk: current device does not support audio-track switching

## Compatibility decision

Both real samples match the intended Phase 12 catalog shape: one physical MV file, one video stream, and two audio tracks that can later be mapped to `trackRoles.original` and `trackRoles.instrumental`.

For current web TV playback, both samples remain `unsupported` in this spike run because browser capability probing did not confirm direct playback support and the `audioTracks` API is unavailable. The sample files should be treated as valid real-library inputs, but queueable playback should stay gated until preprocessing or a runtime with verified container and audio-track support is available.
