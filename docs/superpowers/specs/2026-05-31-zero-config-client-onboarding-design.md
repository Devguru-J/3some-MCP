# Zero-config client onboarding via committed `.mcp.json` + `.claude/settings.json`

Date: 2026-05-31

## Problem

Connecting a new Mac to the `team-collab` hub currently takes three manual steps:
clone the repo, run a long `claude mcp add … --header …` command, and hand-edit
`~/.claude/settings.json` to add the inbox hook. This is error-prone (the token
mismatch we just hit) and not "just open the repo and go."

## Goal

A teammate clones the repo, sets a couple of environment variables, opens Claude
Code in the repo, and the `team-collab` server appears in `/mcp` ready to enable
— with the auto-inbox hook already wired. No `claude mcp add`, no manual
settings editing.

## Approach

Commit two project-scoped config files to the repo. Claude Code reads both when
a session starts in the project directory.

### 1. `.mcp.json` (repo root)

Declares the HTTP MCP server. Claude Code shows it in `/mcp` and asks the user to
approve the project-scoped server once. Secrets stay out of git via env-var
expansion (`${VAR}` and `${VAR:-default}` are supported in `.mcp.json`).

```json
{
  "mcpServers": {
    "team-collab": {
      "type": "http",
      "url": "${COLLAB_URL:-http://192.168.45.169:8787}/mcp",
      "headers": {
        "X-Auth-Token": "${COLLAB_TOKEN}",
        "X-Agent-Id": "${AGENT_ID}",
        "X-Agent-Tool": "claude"
      }
    }
  }
}
```

- `COLLAB_TOKEN` and `AGENT_ID` come from the teammate's shell env — never
  committed.
- `COLLAB_URL` defaults to the current hub LAN address; override only if the IP
  changes.

### 2. `.claude/settings.json` (repo root)

Registers the inbox hook so unread messages auto-surface each turn, without the
teammate editing their personal settings. Uses `$CLAUDE_PROJECT_DIR` so the path
is portable, and defaults `COLLAB_URL` inline so only the two secrets are needed
from the environment.

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "COLLAB_URL=\"${COLLAB_URL:-http://192.168.45.169:8787}\" \"$CLAUDE_PROJECT_DIR/setup/inbox-hook.sh\""
          }
        ]
      }
    ]
  }
}
```

The hook script already reads `COLLAB_URL`, `COLLAB_TOKEN`, `AGENT_ID` from its
environment and stays silent if the hub is unreachable or env is missing, so it
degrades safely.

## New onboarding flow

1. `git clone https://github.com/Devguru-J/3some-MCP.git && cd 3some-MCP`
2. `export COLLAB_TOKEN=<shared-token> AGENT_ID=<your-unique-handle>`
   (e.g. add to `~/.zshrc`)
3. Open Claude Code in the repo → approve `team-collab` in `/mcp` and approve the
   project hook → done. Tools + auto-inbox both work.

## Out of scope

- Codex onboarding stays as documented (bearer + `?agent_id`); `.mcp.json` is a
  Claude Code feature. `setup/README.md` keeps the Codex section.
- The hub server, token rotation, and launchd auto-start are unchanged.

## Files changed

- NEW `.mcp.json`
- NEW `.claude/settings.json`
- UPDATE `setup/README.md` — replace the manual Claude Code steps with the
  zero-config flow (keep Codex section).
- UPDATE `.env.example` — note `AGENT_ID` / `COLLAB_URL` client-side env vars.

## Risks / notes

- A teammate who forgets to export `COLLAB_TOKEN`/`AGENT_ID` will get a 401 / no
  inbox. README must call this out as the first checklist item.
- On the dev Mac (this one), the user-scoped inbox hook already exists; the
  committed project hook will run too but no-op without env, so it's harmless.
