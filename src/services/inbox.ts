import type { Message, Task, Agent } from "./types.js";
import type { MessagesService } from "./messages.js";
import type { TasksService } from "./tasks.js";
import type { AgentsService } from "./agents.js";

export interface InboxSummary {
  unread: Message[];
  myTasks: Task[]; // open tasks assigned to this agent (not done)
  online: Agent[];
}

export function createInboxService(deps: {
  messages: MessagesService;
  tasks: TasksService;
  agents: AgentsService;
}) {
  return {
    /**
     * One catch-up payload for an agent: unread messages (advances the
     * message cursor), the agent's open tasks, and the online roster.
     */
    forAgent(agentId: string, ttlSec: number): InboxSummary {
      const { messages } = deps.messages.read({ agentId });
      const myTasks = deps.tasks
        .list({ assignee: agentId })
        .filter((t) => t.status !== "done");
      const online = deps.agents.listOnline(ttlSec);
      return { unread: messages, myTasks, online };
    },
  };
}

export type InboxService = ReturnType<typeof createInboxService>;
