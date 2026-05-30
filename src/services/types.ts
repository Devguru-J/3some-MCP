export interface Agent {
  id: string;
  tool: string;
  last_seen: string | null;
}

export interface Message {
  id: number;
  from_agent: string;
  recipient: string;
  body: string;
  reply_to: number | null;
  created_at: string;
}

export type TaskStatus = "todo" | "doing" | "review" | "done";

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignee: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PresenceRow {
  agent_id: string;
  status: string | null;
  working_on: string | null;
  updated_at: string;
}

export interface Snippet {
  id: number;
  from_agent: string;
  title: string;
  language: string | null;
  content: string;
  created_at: string;
}
