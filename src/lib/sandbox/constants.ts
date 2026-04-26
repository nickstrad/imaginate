export const SANDBOX_DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
export const SANDBOX_PORT = 3000;

export const PREVIEW_PROBE_ATTEMPTS = 240;
export const PREVIEW_PROBE_INTERVAL_MS = 250;
export const PREVIEW_UNHEALTHY_RESTART_ATTEMPTS = 8;
export const PREVIEW_SERVER_COMMAND =
  "cd /home/user && npx next dev --turbopack -H 0.0.0.0 -p 3000";
export const PREVIEW_PROCESS_CHECK_COMMAND =
  "pgrep -f '[n]ext dev' >/dev/null && echo running || echo missing";
export const PREVIEW_PROCESS_STOP_COMMAND = "pkill -f '[n]ext dev' || true";
