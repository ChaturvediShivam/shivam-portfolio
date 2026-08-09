import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Read .env.local without a dotenv dependency.
 *
 * The suite needs the service-role key to clean up rows it created. Next loads
 * this file for the servers it starts, but the setup and teardown scripts run
 * as plain Node and get no such treatment.
 */
export function localEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  let raw: string;
  try {
    raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}
