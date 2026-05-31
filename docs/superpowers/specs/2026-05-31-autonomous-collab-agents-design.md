# Autonomous Collaboration Agents — Design

**Date:** 2026-05-31
**Status:** Approved, implementing

## Problem

Two pain points with the current 3some-collab hub:

1. **Agents are passive.** A Claude session only acts when its human types. When a
   teammate posts a task or a DM, the receiving session does nothing until poked.
   Even when poked, it tends to ask "should I handle this?" instead of just doing
   the assigned work.
2. **No "always listening" mode.** The user wants: keep the MCP off normally; when
   the team decides to collaborate, turn the `team-collab` MCP **on** from `/mcp`
   and have each session automatically listen, pick up assigned work, and respond
   — then stop cleanly when the MCP is turned **off** again.

## Hard constraint

A Claude Code session does not wake itself. An idle session only runs a turn when
(a) the human types, (b) `/loop` / a self-paced ScheduleWakeup fires, or (c) an
external process drives it. "Listen forever while idle" therefore requires a timer
that keeps spending tokens. This is a platform limit, not a hub limit.

Critically: **`/mcp` on/off toggles tool availability in the session, and only the
model can observe that.** A bash hook cannot tell that the user disabled the server
(the hub stays reachable). So the auto-stop signal must be model-observed: "are my
`mcp__team-collab__*` tools still here?"

## Design

The `team-collab` MCP being enabled is the master switch. Two pieces:

### Piece 1 — MCP server `instructions` (the brain)

Populate the `instructions` field on the `McpServer` in `src/mcp/server.ts`. The
MCP client loads this automatically on connect (surfaced like other "MCP Server
Instructions"), so every connected agent — Claude, Codex — gets the collaboration
protocol with zero local config.

Contents:
- At the start of each turn, check unread messages and tasks assigned to you.
- **A `todo` task assigned to you is a standing instruction: claim it, do it, post
  the result to the relevant channel, and move it to `review`. Do not ask the human
  for permission first.**
- Safety rules: no destructive file changes; new files only under `tmp/`; if a task
  is ambiguous or risky, ask in the channel rather than guessing.
- Keep presence fresh; announce what you're working on.

This alone makes "turn MCP on → behaves like a proactive teammate" true for any turn
the agent gets (and the inbox hook already injects pending work each turn).

### Piece 2 — `/listen` self-terminating loop (the autopilot)

A committed slash command `.claude/commands/listen.md`. Typing `/listen` starts a
**self-paced** loop (built-in `loop` skill / ScheduleWakeup — model decides each
iteration whether to continue, NOT a fixed harness interval). Each iteration:

1. **If `mcp__team-collab__*` tools are unavailable** (user turned the MCP off in
   `/mcp`) → report "listen mode off" and **do not schedule another iteration** →
   the loop dies on its own. No leftover cost.
2. Otherwise: refresh presence, read messages, list tasks assigned to me. Handle
   assigned `todo` work per the Piece-1 protocol; reply to `@me` DMs.
3. Schedule the next iteration ~30s out.

`/listen stop` (or Esc) stops it manually.

Because step 1 is model-observed, **disabling the MCP auto-stops the loop** — exactly
the requested behavior. No separate "turn the loop off" action.

### Switch mapping

| Action | Result |
|---|---|
| MCP **off** (normal) | No tools, no loop, zero cost |
| MCP **on** + `/listen` per session | Autonomous collaboration + ~30s monitoring loop |
| MCP **off** again | Next iteration sees no tools → loop self-terminates |

The only manual step is `/listen` once when starting. Intercepting the `/mcp`
*enable* moment is not supported by Claude Code (no hook fires on toggle-on), so the
start stays explicit; the stop is automatic via tool disappearance.

## Out of scope (YAGNI)

- SessionStart auto-start of the loop (cost risk; surprising).
- A separate headless worker-bot process.
- A Stop-hook backlog drainer (the loop already covers continuous processing).

## Components touched

- `src/mcp/server.ts` — add `instructions` to the `McpServer` constructor.
- `.claude/commands/listen.md` — new slash command (the self-terminating loop).
- `setup/README.md` — document `/listen` in the onboarding flow.

## Testing

- `npm test` + `tsc --noEmit` stay green (instructions is an additive string).
- Manual: with two sessions (`tuesday-claude`, `claude-b`), enable MCP, run
  `/listen` in each, post a task to one, confirm it is claimed, worked, and reported
  without human prompting; then disable MCP and confirm both loops self-terminate.

## Deployment note

Piece 1 lives in server code on the Mac Mini hub — it takes effect only after the
hub pulls and restarts. Piece 2 is client-side (committed to the repo) and is live
for any clone on next `/listen`.
