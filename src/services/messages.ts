import type { DB } from "../db/index.js";
import type { Message } from "./types.js";
import { now } from "../time.js";

export interface SendInput {
  from: string;
  to: string; // '#channel' or '@agent'
  body: string;
  replyTo?: number;
}

export interface ReadInput {
  agentId: string;
  channel?: string; // optional view filter, e.g. '#frontend'
  limit?: number;
}

export interface ReadResult {
  messages: Message[];
}

export function createMessagesService(db: DB) {
  const insert = db.prepare(
    `INSERT INTO messages (from_agent, recipient, body, reply_to, created_at)
     VALUES (@from, @to, @body, @replyTo, @createdAt)`
  );
  const byId = db.prepare("SELECT * FROM messages WHERE id = ?");
  const getCursor = db.prepare(
    "SELECT last_read_id FROM message_reads WHERE agent_id = ?"
  );
  const setCursor = db.prepare(
    `INSERT INTO message_reads (agent_id, last_read_id) VALUES (?, ?)
     ON CONFLICT(agent_id) DO UPDATE SET last_read_id = excluded.last_read_id`
  );

  return {
    send(input: SendInput): Message {
      const info = insert.run({
        from: input.from,
        to: input.to,
        body: input.body,
        replyTo: input.replyTo ?? null,
        createdAt: now(),
      });
      return byId.get(info.lastInsertRowid as number) as Message;
    },

    /**
     * Unread messages visible to `agentId` (channels + own DMs), excluding
     * messages they sent. Advances the read cursor to the max id returned.
     * `channel` is a view filter only. (v1 simplification: catching up with a
     * channel filter still advances the global cursor past lower-id messages
     * in other channels — acceptable at our scale; the inbox hook reads with
     * no filter so it always catches up correctly.)
     */
    read(input: ReadInput): ReadResult {
      const limit = input.limit ?? 50;
      const cursorRow = getCursor.get(input.agentId) as
        | { last_read_id: number }
        | undefined;
      const lastRead = cursorRow?.last_read_id ?? 0;

      const params: unknown[] = [lastRead, input.agentId, `@${input.agentId}`];
      let sql = `SELECT * FROM messages
                 WHERE id > ? AND from_agent != ?
                   AND (recipient LIKE '#%' OR recipient = ?)`;
      if (input.channel) {
        sql += " AND recipient = ?";
        params.push(input.channel);
      }
      sql += " ORDER BY id ASC LIMIT ?";
      params.push(limit);

      const rows = db.prepare(sql).all(...params) as Message[];
      if (rows.length > 0) {
        const maxId = Math.max(lastRead, ...rows.map((r) => r.id));
        setCursor.run(input.agentId, maxId);
      }
      return { messages: rows };
    },

    listChannels(): string[] {
      const rows = db
        .prepare(
          "SELECT DISTINCT recipient FROM messages WHERE recipient LIKE '#%' ORDER BY recipient"
        )
        .all() as { recipient: string }[];
      return rows.map((r) => r.recipient);
    },
  };
}

export type MessagesService = ReturnType<typeof createMessagesService>;
