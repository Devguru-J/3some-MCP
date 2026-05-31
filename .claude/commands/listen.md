---
description: Enter autonomous collaboration listen mode (real-time Monitor + self-paced loop, until the MCP is turned off)
---

You are entering **collaboration listen mode** for the 3some-collab hub.

Argument: `$ARGUMENTS` — if it is `stop`, end any active listen loop now, `TaskStop`
the collab Monitor if one is running, report "listen mode off", and do nothing else.

Otherwise, start a **self-paced loop** using the `loop` skill (no fixed interval —
you decide each iteration whether to continue). The loop is woken two ways: a
**real-time Monitor** (primary, ~3s) and a long **ScheduleWakeup fallback** (safety
net). On every iteration run this routine:

1. **Check the master switch first.** If your `mcp__team-collab__*` tools are NOT
   available, the team-collab MCP has been turned off in `/mcp`. `TaskStop` the
   collab Monitor (find it via `TaskList` if its id isn't in context), report
   "listen mode off (MCP disabled)" and **end the loop — do not schedule another
   iteration.** This is how the loop turns itself off; never keep polling without
   the hub tools. (The Monitor runs via curl, independent of MCP, so it will NOT
   stop on its own — you must TaskStop it here.)

2. **Ensure the real-time Monitor is running.** Call `TaskList`; if no collab
   Monitor is active, arm one with the `Monitor` tool (`persistent: true`):
   `bash "$CLAUDE_PROJECT_DIR/setup/collab-monitor.sh"`. It reads the hub
   read-only (GET /api/messages, never advancing the read cursor) and emits one
   line per new message addressed to you (channels + your DMs, excluding your own
   posts), waking this loop within ~3s — bypassing the 60s ScheduleWakeup floor.
   It needs `COLLAB_TOKEN` and `AGENT_ID` in the env (same contract as
   `inbox-hook.sh`); if either is missing the Monitor exits immediately — fall
   back to ScheduleWakeup-only polling and note it. Arm it ONCE; skip this step if
   already running.

3. Do one collaboration pass:
   - `set_presence` to keep yourself shown as online and listening. Be honest
     about capacity: `"busy: <task>"` while working, `"idle / listening"` when free.
   - `read_messages` — handle any unread DMs/channel posts addressed to you.
   - **Join open discussion when you can contribute.** For channel posts NOT
     addressed to you, chime in only when you can ADD something — new info, a
     correction, a relevant finding, a concrete suggestion, or spotting a problem.
     Never post bare agreement ("sounds good", "agreed"); if you have nothing to
     add, stay silent. Don't reply to your own message or restate a settled point,
     and drop a thread once it's just back-and-forth with no new substance.
   - **Capacity-aware:** before grabbing unclaimed work or diving into a thread,
     check `who_is_online`. If you're mid-task, finish it first — don't drop
     committed work to chase chatter. Whoever is idle carries the conversation and
     picks up loose threads; busy agents stay heads-down.
   - `list_tasks` for tasks assigned to you. For each `todo` one, follow the hub
     protocol from the server instructions: `claim_task` → do the work → post the
     result with `send_message` → `update_task` to `review`. Act on assigned work
     without asking for permission.
   - Respect the hub safety rules: no destructive file changes, new files only
     under `tmp/`, ask in-channel when a task is ambiguous instead of guessing.

4. If there was nothing to do, that's fine — just stay idle this round.

5. **Schedule the next iteration as a long fallback (~1200–1800s).** The Monitor
   is the real wake signal, so this is only a heartbeat in case the Monitor dies;
   don't poll on a short interval (idle ticks past the 5-minute cache window are
   pure overhead). If you were woken by a `<task-notification>` from the Monitor,
   handle the message, then reset the same long fallback.

Keep each iteration short. The human is monitoring and will turn the MCP off in
`/mcp` when the session is done, which you detect in step 1 and shut down cleanly
(including stopping the Monitor).
