# Swifty — API & Daemon Roadmap

The build order for the backend work, derived from ARCHITECTURE.md and the
panel design ([Swifty Panel on Claude Design](https://claude.ai/design/p/967d0efd-b8e1-4f5e-a019-c6900ec2a6c5?file=Swifty+Panel.dc.html),
screens referenced below as D1–D4 and A1–A14). The design is the UI
contract: every milestone here exists to make one or more of its screens
real. Milestones are dependency-ordered — later ones assume the primitives
of earlier ones.

## Where we are

Shipped on `develop`:

- Panel: auth (sessions, API keys), users, settings, setup wizard
  (`/api/v1/setup`), nodes + allocations + health + config, servers CRUD
  with variable rules and SFTP credentials, template registry, typed event
  bus + module loader (module-host foundation).
- Daemon: supervisor (per-server users, transient systemd units, sandbox,
  quotas, installs), HTTP API with per-node token auth, server lifecycle
  endpoints (power actions), system info.
- Templates: `counter-strike-16`, `minecraft-java`.

What's missing is everything that connects them: the panel never talks to
the daemon, and nothing the daemon knows (state, logs, stats) ever reaches
the panel or the browser.

## M1 — Agent channel & power wiring

*The foundation. Serves D4 (node join), A1 (state), and everything below.*

The daemon dials the panel with a persistent outbound WebSocket
(`wss://<panel>/agent`) — nodes need outbound 443 only; inbound stays for
players and SFTP. All control, events, stats, and log streams ride this
channel.

- [ ] Typed agent protocol in `@swifty/sdk`: commands down (power,
      install, sync), events up (state change, console lines, stats,
      install progress, crash), versioned like the REST contract.
- [ ] Daemon: channel client — connect, authenticate with the node token,
      heartbeat, reconnect with backoff, re-sync state on reconnect.
- [ ] Panel: agent gateway — accepts node connections, tracks node
      online/offline, dispatches commands, publishes inbound events onto
      the module-host event bus.
- [ ] Server state machine synced from daemon events: `installing`,
      `starting`, `running`, `stopping`, `stopped`, `crashed`,
      `suspended` (statuses live in `@swifty/sdk` as `SERVER_STATUS_VALUES`).
- [ ] `POST /api/v1/servers/:id/power` (start / stop / restart / kill)
      dispatched over the channel.
- [ ] Node join flow: one-time expiring join tokens, install-script
      endpoint (`curl | sh -s -- --join <token>`), agent self-registration
      handshake, hardware inventory + port probe report.

## M2 — Console & provisioning streams

*Serves A2 (console), A8/A9 (first server + provisioning).*

- [ ] Daemon: per-server stdout/stderr ring buffer (≥2 048 lines), stdin
      write, log file download.
- [ ] Browser stream auth: short-lived JWTs minted by the panel, scoped
      per server and per capability (`console.read`, `console.write`) —
      the §7 security model.
- [ ] Panel WS gateway for browsers: subscribe to a server's console,
      send commands; fan-out from the agent channel.
- [ ] Install pipeline emits step-level progress (user created → template
      unpacked → download % → mod loader → config written → first-boot
      health check) interleaved with the raw install log.
- [ ] First-boot health check driven by the template's `ready_regex`;
      connect address surfaces only after it passes.

## M3 — Telemetry & dashboard data

*Serves A1 (dashboard), A11 (game health tiles).*

- [ ] Daemon: 1 s sampler per server from cgroup accounting (CPU, memory,
      disk quota usage), pushed over the agent channel.
- [ ] Panel: rolling 60-minute retention buffer, WS fan-out to browsers,
      fleet-level aggregates for the server list.
- [ ] Game query adapters (Source A2S, Minecraft ping, SA-MP query)
      selected by the template's `query.protocol` — player counts, map,
      version.
- [ ] Activity/audit log: every mutating action (who, what, from where),
      plus daemon-originated entries (crash, reconnect, schedule runs).
      A1, A10, and A13 all render from it.

## M4 — File manager

*Serves A3 (files).*

- [ ] Daemon file API, every operation as the server's Unix user: list,
      stat, read, write, rename/move, chmod, delete, mkdir,
      archive/unarchive (tar + zstd), disk usage.
- [ ] Uploads/downloads go browser ↔ daemon directly with signed
      short-lived URLs — file bytes never proxy through the panel.
- [ ] Panel endpoints proxying metadata operations and minting the signed
      URLs, with per-capability permission checks.

## M5 — Backups & schedules

*Serves A7 (backups), A14 (schedules).*

- [ ] Daemon: hot backups (tar + zstd while the server runs), slot
      quotas, restore, progress events over the channel.
- [ ] Offsite mirror to S3-compatible storage (nightly-only option).
- [ ] Daemon-side scheduler — schedules run on the node and survive panel
      outages: cron triggers, ordered task chains (console command, wait,
      power action, backup) where a failed step stops the chain,
      "skip if players online" condition, run-now, pause.
- [ ] Panel: backup CRUD + signed download URLs, schedule CRUD synced to
      the node, run history in the activity log.

## M6 — Crash handling & diagnostics

*Serves A10 (crash screen), A1 (crashed state).*

- [ ] Daemon: exit code/signal capture, last-output excerpt, state
      snapshot at exit (memory, CPU, players, uptime), crash event over
      the channel.
- [ ] Restart-on-crash with loop suppression (N crashes within M minutes
      pauses autostart) and explicit re-enable.
- [ ] Panel: crash history with signature grouping (same excerpt
      fingerprint → one group), correlation with recent changes from the
      activity log.

## M7 — Subusers & per-server permissions

*Serves A13 (subusers).*

- [ ] Per-server subuser grants with capability-level permissions
      (control, console, files, mods, players, backups) and presets
      (co-admin, moderator, builder) — presets are starting points, grants
      are stored per capability.
- [ ] Owner-only actions (delete server, manage subusers, billing) are
      never delegable — enforced server-side.
- [ ] Email invites with expiry, resend, revoke.
- [ ] Per-server access log including denied attempts.
- [ ] Stream JWTs from M2 carry the subuser's capabilities.

## M8 — Game-aware layer

*Serves A4 (startup), A5 (mods), A11 (Minecraft), A12 (SA-MP).*

- [ ] Template schema extensions: surfaced config keys (rendered as
      game-specific settings panels), version pin / track-latest with
      update-before-boot policy, file-validation action, game-specific
      panel descriptors (worlds, ops/whitelist, gamemodes, filterscripts)
      — all data in the template YAML, never hardcoded per game.
- [ ] Daemon snapshot primitive: snapshot a directory before a mutating
      operation, restore on demand — designed once, used by the mod
      manager (rollback on failed boot) and the crash screen's rollback.
- [ ] Mod manager: install from catalogue or GitHub release, dependency
      checks, load order, update detection, snapshot-before-write.
- [ ] Players & moderation: rcon-backed player list, kick/ban, admin
      list; plugin-owned ban databases are read, never written.

## Setup wizard follow-ups (any time, independent)

*Serves D1–D3.*

- [ ] Environment requirement checks (write access, outbound HTTPS, port
      bind, memory/disk) surfaced by the setup API.
- [ ] Database connection test endpoint (dial, version, charset, grants)
      before migrations run.
- [ ] 2FA enrollment during first-admin creation, with recovery codes.

## Sequencing notes

- M1 is not plain HTTP proxying — it is the persistent agent channel from
  day one. Console (M2), telemetry (M3), provisioning progress (M2), and
  crash events (M6) are all just message types on it; building request/
  response first would mean rebuilding it immediately.
- M2–M4 are independent of each other once M1 lands and can be
  parallelized.
- The activity log lands in M3 but is consumed by M6 (crash correlation)
  and M7 (access log) — keep its writer API generic.
- M1–M4 complete ARCHITECTURE.md Phase 1; M5 pulls backups/schedules
  forward from Phase 2 because the design treats them as core; M6–M8 are
  scope the design adds beyond the original phase table.
- Every milestone lands as API + UI together (the §8 rule); this document
  tracks only the backend half of each pair.
