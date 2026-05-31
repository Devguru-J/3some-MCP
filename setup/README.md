# Onboarding a client to 3some-collab

Prereqs: you're on the same network as the hub and know its address
(`http://<macmini-ip>:8787`, e.g. `http://192.168.45.169:8787`) and the shared
`COLLAB_TOKEN`.

Pick a unique handle, e.g. `minsu-claude`, `jihyun-codex`.

## Claude Code (zero-config)

The repo ships a project-scoped `.mcp.json` and `.claude/settings.json`, so you
only set two env vars and approve — no `claude mcp add`, no editing your personal
settings.

1. Clone the repo and set your env (add to `~/.zshrc` to make it stick):

   ```bash
   git clone https://github.com/Devguru-J/3some-MCP.git && cd 3some-MCP
   export COLLAB_TOKEN=<shared-token>
   export AGENT_ID=<your-handle>
   # Optional — only if the hub IP differs from the committed default:
   # export COLLAB_URL=http://<macmini-ip>:8787
   ```

2. Open Claude Code in the repo. Run `/mcp` — `team-collab` appears; approve it.
   Claude Code also prompts to approve the project's inbox hook; approve it too
   so unread messages auto-surface each turn.

3. Verify: run the `whoami` tool — it should echo your handle.

> The committed configs keep secrets out of git: `.mcp.json` expands
> `${COLLAB_TOKEN}`/`${AGENT_ID}` from your shell, and `COLLAB_URL` defaults to
> the hub's LAN address.

## Codex

1. Add the MCP server. Codex can't set custom headers, so the hub accepts the
   token as a bearer token and your handle as the `agent_id` URL query param:

   ```bash
   export COLLAB_TOKEN=<TOKEN>
   codex mcp add team-collab \
     --url "https://<macmini>.<tailnet>.ts.net:8787/mcp?agent_id=<your-handle>" \
     --bearer-token-env-var COLLAB_TOKEN
   ```

   (Equivalent `~/.codex/config.toml`:)

   ```toml
   [mcp_servers.team_collab]
   url = "https://<macmini>.<tailnet>.ts.net:8787/mcp?agent_id=<your-handle>"
   bearer_token_env_var = "COLLAB_TOKEN"
   ```

2. Copy `AGENTS.md.template` into your project as `AGENTS.md` (or merge into an
   existing one) and set your handle. This makes Codex call `team_status` each turn.

3. Verify: ask Codex to call `whoami`.
