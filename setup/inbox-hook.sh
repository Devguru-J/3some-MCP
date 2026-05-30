#!/usr/bin/env bash
# Claude Code UserPromptSubmit hook: fetch unread team messages + status from
# the 3some-collab hub and inject them as additional context every turn.
#
# Required env (set these in your shell profile or the hook env):
#   COLLAB_URL    e.g. https://macmini.your-tailnet.ts.net:8787
#   COLLAB_TOKEN  the shared team token
#   AGENT_ID      your handle, e.g. minsu-claude
set -euo pipefail

resp="$(curl -fsS --max-time 5 \
  -H "X-Auth-Token: ${COLLAB_TOKEN}" \
  -H "X-Agent-Id: ${AGENT_ID}" \
  -H "X-Agent-Tool: claude" \
  "${COLLAB_URL}/inbox" 2>/dev/null || echo '')"

if [ -z "$resp" ]; then
  # Hub unreachable — stay quiet so it never blocks the prompt.
  exit 0
fi

# Emit additionalContext only when there's something worth surfacing.
node -e '
const r = JSON.parse(process.argv[1] || "{}");
const parts = [];
if (r.unread?.length) {
  parts.push("New team messages:");
  for (const m of r.unread) parts.push(`  [${m.recipient}] ${m.from_agent}: ${m.body}`);
}
if (r.myTasks?.length) {
  parts.push("Your open tasks:");
  for (const t of r.myTasks) parts.push(`  #${t.id} [${t.status}] ${t.title}`);
}
if (r.online?.length) parts.push("Online: " + r.online.map(a => a.id).join(", "));
if (!parts.length) process.exit(0);
const ctx = "[3some-collab]\n" + parts.join("\n");
process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: ctx }
}));
' "$resp"
