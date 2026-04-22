import { z } from "zod";

export const PlanTaskTypeSchema = z.enum([
  "code_change",
  "new_feature",
  "refactor",
  "bug_fix",
  "question",
  "explain",
  "other",
]);
export type PlanTaskType = z.infer<typeof PlanTaskTypeSchema>;

export const PlanOutputSchema = z.object({
  requiresCoding: z.boolean(),
  taskType: PlanTaskTypeSchema,
  targetFiles: z.array(z.string()).default([]),
  verification: z
    .enum(["tsc", "tsc+tests", "tsc+lint", "manual", "none"])
    .default("tsc"),
  notes: z.string().default(""),
  answer: z.string().optional(),
});
export type PlanOutput = z.infer<typeof PlanOutputSchema>;

export const VerificationKindSchema = z.enum([
  "build",
  "test",
  "lint",
  "dev",
  "command",
]);
export type VerificationKind = z.infer<typeof VerificationKindSchema>;

export const VerificationRecordSchema = z.object({
  kind: VerificationKindSchema,
  command: z.string(),
  success: z.boolean(),
});
export type VerificationRecord = z.infer<typeof VerificationRecordSchema>;

export const FinalStatusSchema = z.enum(["success", "partial", "failed"]);
export type FinalStatus = z.infer<typeof FinalStatusSchema>;

export const FinalOutputSchema = z.object({
  status: FinalStatusSchema,
  title: z.string().min(1).max(80),
  summary: z.string().min(1),
  verification: z.array(VerificationRecordSchema).default([]),
  nextSteps: z.array(z.string()).default([]),
});
export type FinalOutput = z.infer<typeof FinalOutputSchema>;
