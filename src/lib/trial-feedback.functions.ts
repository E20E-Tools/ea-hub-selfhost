import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const token = z.string().uuid();
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("share"),
    owner: token,
    invite: token,
    tool: z.string().trim().min(1).max(300),
    goal: z.string().trim().min(1).max(600),
  }),
  z.object({ action: z.literal("read"), owner: token }),
  z.object({ action: z.literal("close"), owner: token }),
  z.object({ action: z.literal("view"), invite: token }),
  z.object({
    action: z.literal("reply"),
    invite: token,
    id: token,
    outcome: z.enum(["yes", "partial", "no"]),
    note: z.string().trim().min(1).max(1000),
  }),
]);
export type TrialCommand = z.infer<typeof schema>;
export type TrialReply = { outcome: "yes" | "partial" | "no"; note: string };
export type TrialResponse = {
  ok: boolean;
  tool?: string;
  goal?: string;
  replies?: TrialReply[];
};
export const trialFeedback = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => schema.parse(v))
  .handler(async ({ data }): Promise<TrialResponse> => {
    const { handleFeedback } = await import("./trial-feedback.server");
    return handleFeedback(data);
  });
