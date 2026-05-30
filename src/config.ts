export interface Config {
  port: number;
  token: string;
  dbPath: string;
  presenceTtlSec: number;
}

export function loadConfig(env = process.env): Config {
  const token = env.COLLAB_TOKEN;
  if (!token || token === "change-me-to-a-long-random-string") {
    throw new Error("COLLAB_TOKEN must be set to a real secret (see .env.example)");
  }
  return {
    port: Number(env.PORT ?? 8787),
    token,
    dbPath: env.DB_PATH ?? "./collab.db",
    presenceTtlSec: Number(env.PRESENCE_TTL_SEC ?? 120),
  };
}
