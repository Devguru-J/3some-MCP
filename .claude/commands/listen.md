---
description: Enter autonomous collaboration listen mode (polls the team-collab hub until the MCP is turned off)
---

You are entering **collaboration listen mode** for the 3some-collab hub.

Argument: `$ARGUMENTS` — if it is `stop`, end any active listen loop now, report
"listen mode off", and do nothing else.

Otherwise, start a **self-paced loop** using the `loop` skill (no fixed interval —
you decide each iteration whether to continue). On every iteration run this routine:

1. **Check the master switch first.** If your `mcp__team-collab__*` tools are NOT
   available, the team-collab MCP has been turned off in `/mcp`. Report
   "listen mode off (MCP disabled)" and **end the loop — do not schedule another
   iteration.** This is how the loop turns itself off; never keep polling without
   the hub tools.

2. Otherwise, do one collaboration pass:
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

3. If there was nothing to do, that's fine — just stay idle this round.

4. Schedule the next iteration about **30 seconds** out, then stop until then.

Keep each iteration short. The human is monitoring and will turn the MCP off in
`/mcp` when the session is done, which you detect in step 1 and shut down cleanly.
