import { getLocalMockVictoriaRuntime, type LocalMockVictoriaRuntime } from "./create-local-mock-victoria-runtime.js";

export type LocalMemoryControlsRuntime = Pick<LocalMockVictoriaRuntime,
  "memoryControlsCollectionHandler" | "memoryControlHandler" | "memorySettingsHandler">;

/** The Next routes intentionally expose only the local mock runtime until live auth is wired. */
export function getLocalMemoryControlsRuntime(
  env: Record<string, string | undefined> = process.env
): LocalMemoryControlsRuntime | null {
  if (env.APP_ENV !== "local" || env.NODE_ENV !== "development" || env.VICTORIA_LOCAL_MEMORY_CONTROLS_ENABLED !== "true") return null;
  const runtime = getLocalMockVictoriaRuntime(env);
  if (!runtime) return null;
  return {
    memoryControlsCollectionHandler: runtime.memoryControlsCollectionHandler,
    memoryControlHandler: runtime.memoryControlHandler,
    memorySettingsHandler: runtime.memorySettingsHandler
  };
}
