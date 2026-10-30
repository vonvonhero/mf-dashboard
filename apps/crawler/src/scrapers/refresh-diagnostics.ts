import { randomUUID } from "node:crypto";
import { safeErrorDetails, writeCrawlerDiagnostic } from "../auth/diagnostics.js";

type RefreshStage =
  | "group_switch"
  | "home_navigation"
  | "modal_dismiss"
  | "button_wait"
  | "button_click"
  | "button_click_retry"
  | "refresh_start_wait";

export async function runRefreshStage<T>(
  stage: RefreshStage,
  action: () => Promise<T>,
): Promise<T> {
  const stageId = randomUUID();
  const started = performance.now();
  const emit = (event: string, details = {}) =>
    writeCrawlerDiagnostic({
      event,
      stage,
      stage_id: stageId,
      elapsed_ms: Math.round(performance.now() - started),
      ...details,
    });
  emit("refresh_stage_started");
  try {
    const result = await action();
    emit("refresh_stage_done");
    return result;
  } catch (failure) {
    emit("refresh_stage_failed", safeErrorDetails(failure));
    throw failure;
  }
}
