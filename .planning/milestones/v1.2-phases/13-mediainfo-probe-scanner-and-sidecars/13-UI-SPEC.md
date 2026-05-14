# Phase 13: MediaInfo Probe, Scanner, and Sidecars - UI Spec

**Generated:** 2026-05-12
**Scope:** Minimal Admin import candidate preview only

## Boundary

Phase 13 UI work is limited to making scanner results reviewable at a glance in the existing Admin Import Workbench. It must not replace the Phase 14 review workflow, add final admission decisions beyond existing buttons, or introduce a new page.

## Required Preview Elements

- Cover thumbnail when `coverPreviewUrl` exists.
- Clear fallback state when no cover exists.
- Media facts from `mediaInfoSummary`: container, duration, video codec, resolution, audio track count.
- Metadata source summary: MediaInfo, filename, sidecar `song.json`.
- Conflict or scanner warning summary when metadata sources disagree, sidecar JSON is invalid, file is unstable, or probe fails.
- Existing candidate metadata form remains the editable surface.

## Visual Rules

- Keep the existing Admin workbench layout: queue pane on the left, candidate detail on the right.
- Add the preview inside the existing `CandidateEditor` detail area, above or near the metadata form.
- Use compact rows/chips rather than a new large card grid.
- Do not nest card-like panels inside other card-like panels.
- Use restrained Admin styling consistent with current Chinese-first product UI.
- Text must fit in the detail pane on desktop and narrow widths; long paths should wrap or truncate with accessible titles.

## Empty And Error States

- No cover: show a compact neutral placeholder and keep the rest of the preview visible.
- Invalid sidecar: show a warning row and keep scanner/candidate actions usable.
- Unstable file: show retry guidance text and do not block other candidates.
- Probe failed: show the probe failure reason and keep candidate visible for later retry.

## Out Of Scope

- Full audio-track role mapping UX. Phase 14 owns detailed track review.
- Formal catalog song detail UI.
- TV playback UI.
- Mobile controller UI.

---
*Phase: 13-mediainfo-probe-scanner-and-sidecars*
