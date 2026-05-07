# Local Dev Runner Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a one-command local runner for the API, admin, TV player, and mobile controller.

**Architecture:** A repo-local Bash script starts each workspace package with the correct LAN-aware environment and redirects output into per-service log files. It stores PID files for start, stop, restart, status, and tail commands.

**Tech Stack:** Bash, pnpm workspace filters, existing Vite and tsx dev servers.

---

### Task 1: Add Local Dev Runner

**Files:**
- Create: `scripts/dev-local.sh`
- Modify: `package.json`

**Steps:**
1. Add a Bash script with `start`, `stop`, `restart`, `status`, and `tail` commands.
2. Use `KTV_LAN_IP` when provided, otherwise detect a LAN IP from the host.
3. Default `MEDIA_ROOT` to `<repo>/home-ktv-media`.
4. Start each service in the background with service-specific logs under `logs/dev/`.
5. Add `dev:local` to the root package scripts.
6. Verify with Bash syntax checking and script status output.
