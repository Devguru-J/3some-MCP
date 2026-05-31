import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Services } from "../services/index.js";

const text = (data: unknown) => ({
  content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
});

/**
 * Behaviour protocol pushed to every connecting client (Claude, Codex, …) as the
 * MCP server `instructions`. The client surfaces this automatically on connect,
 * so agents act like proactive teammates with zero local config. Keep it short
 * and imperative — it competes for attention with the user's own instructions.
 */
const COLLAB_INSTRUCTIONS = `You are connected to the 3some-collab team hub as one of several agents collaborating in real time.

How to behave:
- At the start of each turn, check what's waiting: read_messages (unread DMs + channel posts) and list_tasks for tasks assigned to you.
- A 'todo' task assigned to you is a standing instruction, not a suggestion. Claim it (claim_task), do the work, post the result to the relevant channel (send_message), then move it to 'review' (update_task). Do NOT ask the human for permission first — just do it and report what you did.
- Reply to @you direct messages. Use #channels for team-wide discussion.
- Keep your presence fresh with set_presence so teammates see what you're working on.

Joining open discussion (contribute or stay silent):
- You may jump into channel messages that are NOT addressed to you when you can ADD something: new information, a correction, a relevant finding, a concrete suggestion, or spotting a problem.
- Do NOT post bare agreement or acknowledgement ("sounds good", "agreed", "noted"). If you have nothing to add, stay silent.
- Self-restraint to avoid endless loops: never reply to your own message, don't restate a point already made, and drop a thread once it's just back-and-forth with no new substance. Rule of thumb: if your reply wouldn't change what someone does or knows, don't send it.

Capacity-aware participation:
- Keep presence honest: set_presence(status: "busy: <task>", working_on: …) when you start work, and "idle / listening" when you're free.
- Before grabbing unclaimed work or diving into discussion, check who_is_online. If you're mid-task, FINISH it first — don't drop committed work to chase chatter (a quick essential reply is still fine).
- Whoever is idle carries the conversation forward and picks up loose threads or unassigned tasks; busy agents stay heads-down. This load-balances naturally: the one with spare capacity drives.

Safety rules (hard limits):
- No destructive file changes. Never delete, overwrite, or rewrite existing files as part of hub work.
- Create new files only under tmp/.
- If a task is ambiguous, risky, or would violate these rules, do NOT guess — ask in the channel and leave the task in 'todo'.

You share this hub with humans and other agents. Be concise, attribute your work, and coordinate out loud in the channel.`;

/**
 * Build an McpServer whose every tool acts as `agentId`. We create one server
 * per client connection so identity is fixed for the session and never has to
 * be passed as a tool argument.
 */
export function createMcpServer(
  agentId: string,
  agentTool: string,
  services: Services,
  presenceTtlSec: number
): McpServer {
  services.agents.ensure(agentId, agentTool);

  const server = new McpServer(
    { name: "3some-collab", version: "0.1.0" },
    { instructions: COLLAB_INSTRUCTIONS }
  );

  // --- messaging ---
  server.registerTool(
    "send_message",
    {
      description: "Send a message to a channel (#name) or direct to an agent (@agent-id).",
      inputSchema: {
        to: z.string().describe("'#general' style channel or '@agent-id' DM target"),
        body: z.string(),
        reply_to: z.number().optional().describe("id of the message being replied to"),
      },
    },
    async ({ to, body, reply_to }) => {
      const m = services.messages.send({ from: agentId, to, body, replyTo: reply_to });
      return text({ sent: m.id });
    }
  );

  server.registerTool(
    "read_messages",
    {
      description: "Read messages addressed to you (channels you can see + your DMs) that you haven't read yet. Advances your read cursor.",
      inputSchema: {
        channel: z.string().optional().describe("optional view filter, e.g. '#frontend'"),
        limit: z.number().optional(),
      },
    },
    async ({ channel, limit }) => {
      const { messages } = services.messages.read({ agentId, channel, limit });
      return text(messages);
    }
  );

  server.registerTool(
    "list_channels",
    { description: "List channels that have messages.", inputSchema: {} },
    async () => text(services.messages.listChannels())
  );

  // --- tasks ---
  server.registerTool(
    "post_task",
    {
      description: "Add a task to the shared board.",
      inputSchema: {
        title: z.string(),
        description: z.string().optional(),
        assignee: z.string().optional(),
      },
    },
    async ({ title, description, assignee }) =>
      text(services.tasks.post({ title, description, assignee, createdBy: agentId }))
  );

  server.registerTool(
    "claim_task",
    { description: "Claim a task (assigns it to you, moves todo->doing).", inputSchema: { task_id: z.number() } },
    async ({ task_id }) => text(services.tasks.claim({ taskId: task_id, agentId }))
  );

  server.registerTool(
    "update_task",
    {
      description: "Update a task's status (todo|doing|review|done) with an optional note.",
      inputSchema: {
        task_id: z.number(),
        status: z.enum(["todo", "doing", "review", "done"]),
        note: z.string().optional(),
      },
    },
    async ({ task_id, status, note }) =>
      text(services.tasks.update({ taskId: task_id, status, note, agentId }))
  );

  server.registerTool(
    "list_tasks",
    {
      description: "List tasks on the board, optionally filtered.",
      inputSchema: {
        status: z.enum(["todo", "doing", "review", "done"]).optional(),
        assignee: z.string().optional(),
      },
    },
    async ({ status, assignee }) => text(services.tasks.list({ status, assignee }))
  );

  // --- presence ---
  server.registerTool(
    "set_presence",
    {
      description: "Announce what you're currently doing.",
      inputSchema: {
        status: z.string().describe("e.g. 'refactoring auth.ts'"),
        working_on: z.string().optional().describe("file or task you're on"),
      },
    },
    async ({ status, working_on }) => {
      services.presence.set({ agentId, status, workingOn: working_on });
      return text({ ok: true });
    }
  );

  server.registerTool(
    "who_is_online",
    { description: "See which agents are online and what they're doing.", inputSchema: {} },
    async () => text(services.presence.whoIsOnline(presenceTtlSec))
  );

  // --- snippets ---
  server.registerTool(
    "share_snippet",
    {
      description: "Share a code snippet or decision with the team.",
      inputSchema: {
        title: z.string(),
        content: z.string(),
        language: z.string().optional(),
      },
    },
    async ({ title, content, language }) =>
      text(services.snippets.share({ fromAgent: agentId, title, content, language }))
  );

  server.registerTool(
    "get_snippet",
    { description: "Fetch a shared snippet by id.", inputSchema: { id: z.number() } },
    async ({ id }) => text(services.snippets.get(id) ?? { error: "not found" })
  );

  server.registerTool(
    "list_snippets",
    { description: "List recent shared snippets.", inputSchema: { limit: z.number().optional() } },
    async ({ limit }) => text(services.snippets.list(limit))
  );

  // --- meta ---
  server.registerTool(
    "whoami",
    { description: "Show your resolved identity on the hub.", inputSchema: {} },
    async () => text({ agentId, tool: agentTool })
  );

  server.registerTool(
    "team_status",
    { description: "One-shot summary: unread messages, your open tasks, online roster.", inputSchema: {} },
    async () => text(services.inbox.forAgent(agentId, presenceTtlSec))
  );

  return server;
}
