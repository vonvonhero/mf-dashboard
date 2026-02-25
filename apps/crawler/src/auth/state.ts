import { existsSync } from "node:fs";
import path from "node:path";
import type { BrowserContext } from "playwright";
import { debug } from "../logger.js";

// Auth state file path
const AUTH_STATE_PATH = path.join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "data",
  "auth-state.json",
);

export function getAuthStatePath(): string {
  return AUTH_STATE_PATH;
}

export function hasAuthState(): boolean {
  return existsSync(AUTH_STATE_PATH);
}

export async function saveAuthState(context: BrowserContext): Promise<void> {
  await context.storageState({ path: AUTH_STATE_PATH });
  debug(`Auth state saved to ${AUTH_STATE_PATH}`);
}
