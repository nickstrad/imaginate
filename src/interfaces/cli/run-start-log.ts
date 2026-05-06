interface RunStartLogger {
  info(input: { event: string; metadata?: Record<string, unknown> }): void;
}

export function logRunStart(params: {
  logger: RunStartLogger;
  projectId: string;
  sandboxMode: "local" | "connect" | "create";
}): void {
  params.logger.info({
    event: "run start",
    metadata: {
      projectId: params.projectId,
      sandboxMode: params.sandboxMode,
    },
  });
}
