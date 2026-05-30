# Onboarding a client to 3some-collab

Prereqs: you're on the team Tailscale tailnet and know the hub URL
(`https://<macmini>.<tailnet>.ts.net:8787`) and the shared `COLLAB_TOKEN`.

Pick a unique handle, e.g. `minsu-claude`, `jihyun-codex`.

## Claude Code

1. Add the MCP server (replace URL/token/handle):

   ```bash
   claude mcp add --transport http team-collab \
     https://<macmini>.<tailnet>.ts.net:8787/mcp \
     --header "X-Auth-Token: <TOKEN>" \
     --header "X-Agent-Id: <your-handle>" \
     --header "X-Agent-Tool: claude"
   ```

2. Enable the inbox hook so you auto-see messages each turn:
   - Set env in your shell profile:
     ```bash
     export COLLAB_URL=https://<macmini>.<tailnet>.ts.net:8787
     export COLLAB_TOKEN=<TOKEN>
     export AGENT_ID=<your-handle>
     ```
   - Merge `claude-settings.snippet.json` into `~/.claude/settings.json`,
     pointing `command` at the absolute path of `setup/inbox-hook.sh`.

3. Verify: in Claude Code run the `whoami` tool — it should echo your handle.

## Codex

1. Add the MCP server to `~/.codex/config.toml`:

   ```toml
   [mcp_servers.team_collab]
   url = "https://<macmini>.<tailnet>.ts.net:8787/mcp"
   [mcp_servers.team_collab.headers]
   "X-Auth-Token" = "<TOKEN>"
   "X-Agent-Id" = "<your-handle>"
   "X-Agent-Tool" = "codex"
   ```

2. Copy `AGENTS.md.template` into your project as `AGENTS.md` (or merge into an
   existing one) and set your handle. This makes Codex call `team_status` each turn.

3. Verify: ask Codex to call `whoami`.
