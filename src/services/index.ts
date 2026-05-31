import type { DB } from "../db/index.js";
import { createAgentsService } from "./agents.js";
import { createMessagesService } from "./messages.js";
import { createTasksService } from "./tasks.js";
import { createPresenceService } from "./presence.js";
import { createSnippetsService } from "./snippets.js";
import { createInboxService } from "./inbox.js";

export function createServices(db: DB) {
  const agents = createAgentsService(db);
  const messages = createMessagesService(db);
  const tasks = createTasksService(db);
  const presence = createPresenceService(db);
  const snippets = createSnippetsService(db);
  const inbox = createInboxService({ messages, tasks, agents });
  return { agents, messages, tasks, presence, snippets, inbox };
}

export type Services = ReturnType<typeof createServices>;
