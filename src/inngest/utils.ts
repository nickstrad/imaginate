import { Sandbox } from "@e2b/code-interpreter";

export const SANDBOX_TIMEOUT = 30 * 60 * 1000; // 30 minutes
export const getSandbox = async (sandboxId: string) => {
  const sandbox = await Sandbox.connect(sandboxId);
  await sandbox.setTimeout(SANDBOX_TIMEOUT);
  return sandbox;
};
