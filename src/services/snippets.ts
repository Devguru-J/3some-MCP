import type { DB } from "../db/index.js";
import type { Snippet } from "./types.js";
import { now } from "../time.js";

export function createSnippetsService(db: DB) {
  const insert = db.prepare(
    `INSERT INTO snippets (from_agent, title, language, content, created_at)
     VALUES (@fromAgent, @title, @language, @content, @ts)`
  );
  const byId = db.prepare("SELECT * FROM snippets WHERE id = ?");

  return {
    share(input: {
      fromAgent: string;
      title: string;
      content: string;
      language?: string;
    }): { id: number } {
      const info = insert.run({
        fromAgent: input.fromAgent,
        title: input.title,
        language: input.language ?? null,
        content: input.content,
        ts: now(),
      });
      return { id: info.lastInsertRowid as number };
    },

    get(id: number): Snippet | undefined {
      return byId.get(id) as Snippet | undefined;
    },

    list(limit = 20): Snippet[] {
      return db
        .prepare("SELECT * FROM snippets ORDER BY id DESC LIMIT ?")
        .all(limit) as Snippet[];
    },
  };
}

export type SnippetsService = ReturnType<typeof createSnippetsService>;
