---
phase: 09-verification-traceability-closure
plan: 01
type: execute
wave: 1
depends_on: ["08-code-structure-hardening"]
gap_closure: true
files_modified:
  - .planning/phases/06-tv-playback-experience-polish/06-VERIFICATION.md
  - .planning/phases/07-productized-ui-polish/07-VERIFICATION.md
  - .planning/phases/08-code-structure-hardening/08-VERIFICATION.md
  - .planning/phases/08-code-structure-hardening/08-SUMMARY.md
  - .planning/REQUIREMENTS.md
autonomous: true
requirements:
  - TVUX-01
  - TVUX-02
  - TVUX-03
  - TVUX-04
  - TVUX-05
  - PROD-01
  - PROD-02
  - PROD-04
  - QUAL-02
  - QUAL-03
  - QUAL-04
must_haves:
  truths:
    - "Phase 6, Phase 7, and Phase 8 each have a standalone VERIFICATION.md with requirement-by-requirement evidence and a clear verdict"
    - "08-SUMMARY.md has machine-readable frontmatter with requirements-completed so summary extraction can read the phase output"
    - ".planning/REQUIREMENTS.md marks the verified requirements Complete and leaves Phase 10/11 gaps Pending"
    - "The phase 9 documentation closes only the audit gaps already identified and does not expand scope into PROD-03, PROD-05, or QUAL-01"
  artifacts:
    - path: ".planning/phases/06-tv-playback-experience-polish/06-VERIFICATION.md"
      provides: "Phase 6 verification report for TVUX-01 through TVUX-05"
      contains: "TVUX-05"
    - path: ".planning/phases/07-productized-ui-polish/07-VERIFICATION.md"
      provides: "Phase 7 verification report for PROD-01, PROD-02, and PROD-04"
      contains: "PROD-04"
    - path: ".planning/phases/08-code-structure-hardening/08-VERIFICATION.md"
      provides: "Phase 8 verification report for QUAL-02, QUAL-03, and QUAL-04"
      contains: "QUAL-04"
    - path: ".planning/phases/08-code-structure-hardening/08-SUMMARY.md"
      provides: "Frontmatter-backed summary extraction for the Phase 8 closure report"
      contains: "requirements-completed"
    - path: ".planning/REQUIREMENTS.md"
      provides: "Milestone traceability table with verified and deferred requirement statuses"
      contains: "Phase 11"
  key_links:
    - from: ".planning/phases/06-tv-playback-experience-polish/06-UAT.md"
      to: ".planning/phases/06-tv-playback-experience-polish/06-VERIFICATION.md"
      via: "manual TV verification evidence rolls up into the phase verification report"
      pattern: "TVUX-03"
    - from: ".planning/phases/07-productized-ui-polish/07-UAT.md"
      to: ".planning/phases/07-productized-ui-polish/07-VERIFICATION.md"
      via: "Admin/Mobile UAT evidence rolls up into the phase verification report"
      pattern: "PROD-01"
    - from: ".planning/phases/08-code-structure-hardening/08-SUMMARY.md"
      to: ".planning/REQUIREMENTS.md"
      via: "requirements-completed frontmatter and traceability rows must agree"
      pattern: "QUAL-03"
---

<objective>
Close the v1.1 audit's verification and traceability gaps without changing product behavior.

Purpose: Phase 9 converts already shipped evidence into audit-readable verification reports, restores machine-readable summary metadata for Phase 8, and synchronizes milestone requirement traceability.
Output: `06-VERIFICATION.md`, `07-VERIFICATION.md`, `08-VERIFICATION.md`, a frontmatter-fixed `08-SUMMARY.md`, and a synced `.planning/REQUIREMENTS.md`.
</objective>

<execution_context>
@/Users/shaolongfei/.codex/get-shit-done/workflows/execute-plan.md
@/Users/shaolongfei/.codex/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/STATE.md
@.planning/v1.1-MILESTONE-AUDIT.md
@.planning/phases/09-verification-traceability-closure/09-CONTEXT.md
@.planning/phases/06-tv-playback-experience-polish/06-03-SUMMARY.md
@.planning/phases/06-tv-playback-experience-polish/06-UAT.md
@.planning/phases/07-productized-ui-polish/07-03-SUMMARY.md
@.planning/phases/07-productized-ui-polish/07-UAT.md
@.planning/phases/08-code-structure-hardening/08-SUMMARY.md
@.planning/phases/08-code-structure-hardening/08-PLAN.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write Phase 6 and Phase 7 verification reports</name>
  <files>.planning/phases/06-tv-playback-experience-polish/06-VERIFICATION.md, .planning/phases/07-productized-ui-polish/07-VERIFICATION.md</files>
  <read_first>
    - .planning/phases/06-tv-playback-experience-polish/06-03-SUMMARY.md
    - .planning/phases/06-tv-playback-experience-polish/06-UAT.md
    - .planning/phases/07-productized-ui-polish/07-03-SUMMARY.md
    - .planning/phases/07-productized-ui-polish/07-UAT.md
    - .planning/v1.1-MILESTONE-AUDIT.md
    - .planning/REQUIREMENTS.md
  </read_first>
  <action>
    Create two phase-level verification reports with YAML frontmatter (`phase`, `verified`, `status`, `score`, `requirements`, `source`) and a requirement-by-requirement evidence table.
    - `06-VERIFICATION.md` must verify TVUX-01 through TVUX-05 using the existing Phase 6 summaries and UAT evidence, and it must stay within Phase 6 scope.
    - `07-VERIFICATION.md` must verify PROD-01, PROD-02, and PROD-04 using the existing Phase 7 summaries and UAT evidence, and it must explicitly call out that PROD-03 and PROD-05 are deferred to Phase 10 instead of claiming them here.
    Keep the verdicts explicit, keep the evidence concrete, and do not introduce any new product behavior claims.
  </action>
  <verify>
    node "$HOME/.codex/get-shit-done/bin/gsd-tools.cjs" frontmatter validate .planning/phases/06-tv-playback-experience-polish/06-VERIFICATION.md --schema verification
    node "$HOME/.codex/get-shit-done/bin/gsd-tools.cjs" frontmatter validate .planning/phases/07-productized-ui-polish/07-VERIFICATION.md --schema verification
  </verify>
  <acceptance_criteria>
    - `06-VERIFICATION.md` contains `TVUX-05` and `status: passed`.
    - `07-VERIFICATION.md` contains `PROD-04` and `Phase 10`.
    - Both files validate with the `verification` frontmatter schema.
  </acceptance_criteria>
  <done>Phase 6 and Phase 7 are represented by standalone verification reports that GSD can parse and audit.</done>
</task>

<task type="auto">
  <name>Task 2: Add Phase 8 verification report and restore summary frontmatter</name>
  <files>.planning/phases/08-code-structure-hardening/08-VERIFICATION.md, .planning/phases/08-code-structure-hardening/08-SUMMARY.md</files>
  <read_first>
    - .planning/phases/08-code-structure-hardening/08-SUMMARY.md
    - .planning/phases/08-code-structure-hardening/08-PLAN.md
    - .planning/phases/08-code-structure-hardening/08-CONTEXT.md
    - .planning/v1.1-MILESTONE-AUDIT.md
    - .planning/REQUIREMENTS.md
  </read_first>
  <action>
    Create `08-VERIFICATION.md` with YAML frontmatter and a requirement table that covers QUAL-02, QUAL-03, and QUAL-04, then explicitly state that QUAL-01 remains deferred to Phase 11 because the Admin Import/Songs runtime boundary work is out of scope for Phase 9.
    Add machine-readable YAML frontmatter to `08-SUMMARY.md` so summary extraction can read `requirements-completed` from the file. Use the existing summary body as the phase narrative, and set `requirements-completed` to `QUAL-02`, `QUAL-03`, and `QUAL-04` only.
    Keep the summary body content intact aside from any minimal adjustments needed to fit the new frontmatter.
  </action>
  <verify>
    node "$HOME/.codex/get-shit-done/bin/gsd-tools.cjs" frontmatter validate .planning/phases/08-code-structure-hardening/08-VERIFICATION.md --schema verification
    node "$HOME/.codex/get-shit-done/bin/gsd-tools.cjs" summary-extract .planning/phases/08-code-structure-hardening/08-SUMMARY.md --fields requirements_completed --pick requirements_completed
  </verify>
  <acceptance_criteria>
    - `08-VERIFICATION.md` contains `QUAL-04` and `Phase 11`.
    - `08-SUMMARY.md` contains `requirements-completed`.
    - `summary-extract` returns `QUAL-02`, `QUAL-03`, and `QUAL-04`.
  </acceptance_criteria>
  <done>Phase 8 has a phase-level verification report and a summary that GSD can parse for completed requirements.</done>
</task>

<task type="auto">
  <name>Task 3: Sync milestone traceability and close the audit loop</name>
  <files>.planning/REQUIREMENTS.md</files>
  <read_first>
    - .planning/REQUIREMENTS.md
    - .planning/phases/06-tv-playback-experience-polish/06-VERIFICATION.md
    - .planning/phases/07-productized-ui-polish/07-VERIFICATION.md
    - .planning/phases/08-code-structure-hardening/08-VERIFICATION.md
    - .planning/ROADMAP.md
  </read_first>
  <action>
    Update the v1.1 traceability table and checkbox list so verified requirements are marked complete and deferred requirements remain pending.
    Specifically:
    - mark TVUX-01 through TVUX-05 as complete for Phase 9,
    - mark PROD-01, PROD-02, and PROD-04 as complete for Phase 9,
    - leave PROD-03 and PROD-05 pending for Phase 10,
    - mark QUAL-02, QUAL-03, and QUAL-04 as complete for Phase 9,
    - leave QUAL-01 pending for Phase 11.
    Keep the roadmap phase assignments and the requirement wording unchanged.
  </action>
  <verify>
    node -e "const fs=require('fs'); const t=fs.readFileSync('.planning/REQUIREMENTS.md','utf8'); ['| TVUX-01 | Phase 9 | Complete |','| TVUX-05 | Phase 9 | Complete |','| PROD-01 | Phase 9 | Complete |','| PROD-03 | Phase 10 | Pending |','| QUAL-01 | Phase 11 | Pending |'].forEach(s => { if (!t.includes(s)) throw new Error(s); });"
  </verify>
  <acceptance_criteria>
    - The traceability table shows the Phase 9 requirements as `Complete`.
    - The traceability table keeps PROD-03, PROD-05, and QUAL-01 as `Pending`.
    - The top-level checkbox list matches the traceability table.
  </acceptance_criteria>
  <done>Milestone traceability matches the verified gap-closure scope and preserves the Phase 10/11 deferrals.</done>
</task>

</tasks>

<verification>
Before declaring plan complete:
- [ ] `06-VERIFICATION.md` and `07-VERIFICATION.md` validate with the `verification` schema
- [ ] `08-VERIFICATION.md` validates with the `verification` schema
- [ ] `08-SUMMARY.md` exposes `requirements_completed` through summary extraction
- [ ] `REQUIREMENTS.md` marks the verified requirements complete and keeps Phase 10/11 deferrals pending
- [ ] The plan stays inside the audit gap scope and does not add new product work
</verification>

<success_criteria>

- All tasks completed
- All verification checks pass
- No product behavior scope is expanded beyond the audit gaps
- Phase 9 closes the verification and traceability blockers that prevented milestone archival

</success_criteria>

<output>
After completion, create `.planning/phases/09-verification-traceability-closure/09-SUMMARY.md`
</output>
