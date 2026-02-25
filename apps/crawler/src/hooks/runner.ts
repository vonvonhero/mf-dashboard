import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";
import { log, info, error } from "../logger.js";
import type { Hook } from "./types.js";

const HOOKS_DIR = join(import.meta.dirname, "../../hooks");

export async function runHooks(page: Page): Promise<void> {
  const files = await readdir(HOOKS_DIR).catch(() => []);

  const hookFiles = files
    .filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
    .filter((f) => !f.startsWith("."))
    .sort();

  if (hookFiles.length === 0) return;

  info(`Running ${hookFiles.length} hook(s)...`);

  for (const file of hookFiles) {
    try {
      log(`  Executing: ${file}`);
      const mod = await import(join(HOOKS_DIR, file));
      const hook: Hook = mod.default;
      await hook(page);
    } catch (err) {
      error(`  Error in ${file}:`, err);
    }
  }
}
