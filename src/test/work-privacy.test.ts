import { describe, expect, it } from "vitest";
import { features, initialPolicy, permittedFields } from "@/lib/work-assistant";
describe.each(features)("Archy data permissions for %s", (feature) => {
  const input = {
    feature,
    lang: "en" as const,
    context: "context sample",
    content: "private sample",
  };
  it("starts local and sends no fields", () =>
    expect(permittedFields(input, initialPolicy)).toEqual({}));
  it("permits only selected fields and fails closed when disabled", () => {
    for (const context of [false, true])
      for (const content of [false, true])
        for (const enabled of [false, true]) {
          const fields = permittedFields(input, {
            ...initialPolicy,
            [feature]: { enabled, context, content },
          });
          expect(fields).toEqual({
            ...(enabled && context ? { context: input.context } : {}),
            ...(enabled && content ? { content: input.content } : {}),
          });
        }
  });
});
