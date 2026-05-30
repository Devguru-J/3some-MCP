# 3some-MCP — 팀 협업 MCP 서버 설계

작성일: 2026-05-30
저장소: https://github.com/Devguru-J/3some-MCP

## 목적

서로 다른 컴퓨터에서 작업하는 AI 코딩 에이전트들(Claude Code 2개 + Codex 1개,
총 3개)이 실시간에 가깝게 소통하며 협업할 수 있게 하는 MCP 서버. 사무실 맥미니를
상시 허브로 사용하고, Tailscale로 사내·재택 모두 접속한다.

## 참여자 / 토폴로지

- **허브**: 사무실 맥미니 1대 (상시 가동), Tailscale 테일넷 안에 위치
- **클라이언트**: 너의 Claude Code + 팀원 Claude Code + 팀원 Codex
- **접속**: Tailscale (하이브리드 — 사내/재택 모두). 원격 Streamable HTTP MCP로 접속

```
        ┌─────────────────────── 맥미니 (Tailscale) ───────────────────────┐
        │   team-collab-hub  (Node/TypeScript, 단일 프로세스)                │
        │     MCP 엔드포인트  (Streamable HTTP)  /mcp                        │
        │       └ 도구: send_message, tasks, presence, snippets ...          │
        │     REST 엔드포인트 (hook 전용)        /inbox, /heartbeat          │
        │     읽기전용 웹 대시보드 (선택)         /                          │
        │   SQLite (collab.db)  ← 메시지·태스크·프레즌스·스니펫 영구 저장      │
        └───────────────────────────────────────────────────────────────────┘
              ▲ https://macmini.<tailnet>.ts.net
   ┌──────────┴──────────┐  ┌──────────┴──────────┐  ┌────┴───────────────┐
   │ 너 (Claude Code)     │  │ 팀원 (Claude Code)   │  │ 팀원 (Codex)        │
   │  + inbox hook        │  │  + inbox hook        │  │  + AGENTS.md 규칙   │
   └─────────────────────┘  └─────────────────────┘  └────────────────────┘
```

핵심 결정: **단일 Node 프로세스가 허브**다. MCP(도구 호출) + REST(hook 알림) +
선택적 웹 대시보드를 한 프로세스가 제공하고, 상태는 전부 SQLite 파일 하나에 저장한다.
클라이언트는 원격 URL로 접속하고, 로컬엔 "받은 메시지 자동 확인" hook만 추가한다.

## 데이터 모델 (SQLite, WAL 모드)

- **agents** — `id`(display name, 예: "민수-claude"), `tool`(claude/codex), `last_seen`
- **messages** — `id`, `from_agent`, `to`(`#channel` 또는 `@agent`), `body`, `created_at`, `reply_to`
- **message_reads** — `agent_id`, `last_read_message_id` (읽음 커서 = 알림 기준)
- **tasks** — `id`, `title`, `description`, `status`(todo/doing/review/done), `assignee`, `created_by`, `updated_at`
- **task_events** — 태스크 변경 이력 (누가 언제 무엇을)
- **presence** — `agent_id`, `status`(텍스트), `working_on`(파일/태스크), `updated_at`(TTL 만료)
- **snippets** — `id`, `from_agent`, `title`, `language`, `content`, `created_at`

### 메시지 라우팅 (채널 + DM)

`messages.to` 필드 하나로 모든 라우팅을 표현한다:

- `#general`, `#frontend`, … → **채널**. 누구나 읽고 쓰기 가능. 글을 올리면 채널이
  자동 생성된다. 별도 멤버십·권한 테이블 없음 (YAGNI).
- `@민수-claude` → **DM**. 특정 에이전트에게만.
- 전체 방송은 별도 기능 없이 `#general`에 올리면 전원이 보는 것으로 갈음한다.
- 기본 채널은 `#general`.

## MCP 도구

**메시지**
- `send_message(to, body, reply_to?)`
- `read_messages(channel?, since?, limit?)` — 안 읽은 것부터, 읽음 커서 자동 갱신
- `list_channels()`

**태스크 보드**
- `post_task(title, description?, assignee?)`
- `claim_task(task_id)`
- `update_task(task_id, status, note?)` — todo→doing→review→done
- `list_tasks(status?, assignee?)`

**프레즌스**
- `set_presence(status, working_on?)`
- `who_is_online()` — 각 에이전트 최신 상태 + 마지막 활동 시각

**파일/코드 공유**
- `share_snippet(title, content, language?)` → 짧은 ID 반환
- `get_snippet(id)`
- `list_snippets(limit?)`

**기타**
- `whoami()`
- `team_status()` — 온라인 멤버 + 안 읽은 메시지 + 진행 태스크 한 번에 요약

## 실시간 방식 (자동 확인)

"에이전트가 가만히 있어도 받은 것을 알아차리게" 하는 부분.

**Claude Code**
- `UserPromptSubmit` hook 스크립트 설치 → 매 턴 시작 시 `GET /inbox?agent=<id>` 호출.
- 서버는 그 에이전트의 안 읽은 메시지 + 새 태스크 변경 + 멘션을 요약 반환.
- hook이 결과를 `additionalContext`로 주입 → 클로드가 자동 인지·반응.
- 동시에 `last_seen` 갱신(하트비트) → 프레즌스 온라인 표시.

**Codex**
- Claude Code식 hook이 없으므로 병행:
  1. `AGENTS.md`에 "응답 시작 전 `team_status()`/`read_messages()`를 먼저 호출" 규칙.
  2. (선택) 셸 래퍼/별칭으로 세션 시작 시 inbox 출력.

**폴링 주기**: hook은 턴마다 동작하므로 별도 타이머 불필요. 밀리초 단위 실시간은
아니지만, 사람이 코딩하며 협업하는 맥락에선 충분히 실시간처럼 느껴진다.

## 신원 & 보안

- **신원**: 접속 시 `X-Agent-Id` 헤더로 이름 전달 (예: `민수-claude`). 처음 보는 ID는
  서버가 `agents` 테이블에 자동 등록.
- **보안 1차**: Tailscale — 테일넷 기기만 도달 가능(사실상 사설망).
- **보안 2차**: 팀 공용 `X-Auth-Token` 1개. 테일넷 안에서도 토큰 없으면 거부. `.env` 관리.
- 읽기/쓰기 권한 등급은 제외 (전원 동등, 내부 도구) — YAGNI.

## 클라이언트 온보딩 (`setup/`)

- 복붙용 명령어: Claude Code `claude mcp add ...` 한 줄, Codex `~/.codex/config.toml` 스니펫.
- inbox hook 스크립트 + settings.json hook 스니펫 (Claude Code).
- `AGENTS.md` 템플릿 (Codex).
- 맥미니 서버 실행: `npm run start` + `launchd`/`pm2` 상시 가동 안내.

## 기술 스택

- 런타임: Node.js + TypeScript
- MCP: `@modelcontextprotocol/sdk` (Streamable HTTP transport)
- HTTP: Hono (경량 라우팅)
- DB: `better-sqlite3` (WAL 모드, 동기 API)
- 테스트: `vitest`

## 테스트 전략

- **단위**: 각 도구의 DB 로직(메시지 저장/읽음 커서, 태스크 상태 전이, 프레즌스 TTL) — in-memory SQLite.
- **통합**: 실제 HTTP로 서버 기동 → 에이전트 2개 메시지 송수신 → `/inbox`가 안 읽은 것만 정확히 반환.
- **수동 E2E**: Claude Code 2세션으로 실제 대화·태스크 시연.
- TDD (도구별 테스트 우선).

## 범위에서 제외 (YAGNI)

- 권한 등급/역할
- 채널 멤버십·구독 관리
- 진짜 push(SSE/WebSocket) 실시간 — hook 폴링으로 충분
- Postgres 등 외부 DB — 동시 에이전트 수십+ 또는 고빈도 쓰기 생기면 그때 재검토

## 향후 확장 여지

- 읽기전용 웹 대시보드(사람이 보드 한눈에)
- SSE 기반 실제 push
- 표준 SQL 스키마라 Postgres 마이그레이션 용이
