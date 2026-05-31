import { describe, it, expect } from "vitest";
import { openDb } from "../src/db/index.js";
import { createSnippetsService } from "../src/services/snippets.js";

describe("snippets service", () => {
  it("share() returns an id and get() round-trips the content", () => {
    const db = openDb(":memory:");
    const snippets = createSnippetsService(db);
    const { id } = snippets.share({
      fromAgent: "a",
      title: "auth helper",
      content: "export const x = 1;",
      language: "ts",
    });
    expect(id).toBeGreaterThan(0);
    const got = snippets.get(id);
    expect(got?.content).toBe("export const x = 1;");
    expect(got?.title).toBe("auth helper");
  });

  it("list() returns newest first, limited", () => {
    const db = openDb(":memory:");
    const snippets = createSnippetsService(db);
    snippets.share({ fromAgent: "a", title: "one", content: "1" });
    snippets.share({ fromAgent: "a", title: "two", content: "2" });
    const list = snippets.list(1);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("two");
  });
});
