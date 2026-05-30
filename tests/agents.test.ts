import { describe, it, expect } from "vitest";
import { openDb } from "../src/db/index.js";

describe("openDb", () => {
  it("creates tables in an in-memory db", () => {
    const db = openDb(":memory:");
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='messages'"
      )
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("messages");
  });
});
