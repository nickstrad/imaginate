import { Sandbox } from "@e2b/code-interpreter";

export const getSandbox = async (sandboxId: string) =>
  await Sandbox.connect(sandboxId);
