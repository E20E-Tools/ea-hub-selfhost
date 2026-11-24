import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  features,
  names,
  sections,
  permittedFields,
  type Feature,
  type Policy,
} from "@/lib/work-assistant";
import {
  workPolicy,
  saveWorkPolicy,
  workCompletion,
  issueCompletion,
} from "@/lib/work-assistant.functions";
import { dictionaries } from "@/lib/copy";

export function useWorkPolicy() {
  return useQuery({
    queryKey: ["archy-work-policy"],
    queryFn: () => workPolicy(),
    staleTime: 15000,
  });
}

export function WorkControls({ ar }: { ar: boolean }) {
  const q = useWorkPolicy(),
    cache = useQueryClient(),
    [draft, set] = useState<Policy | null>(null),
    [status, note] = useState(""),
    [busy, wait] = useState(false);
  const policy = draft ?? q.data,
    i = ar ? 0 : 1;
  return (
    <section className="bx-panel grid gap-3">
      <h2>{dictionaries[ar ? "ar" : "en"].workAssistantTaskAssistantAndPrivacy}</h2>
      <p>
        {dictionaries[ar ? "ar" : "en"].workAssistantChooseAvailableTasksAnd}
      </p>
      {policy ? (
        features.map((f) => (
          <fieldset key={f} className="rounded-lg border p-3 grid gap-2">
            <legend>{names[f][i]}</legend>
            {(["enabled", "context", "content"] as const).map((k, j) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={policy[f][k]}
                  disabled={busy || (k !== "enabled" && !policy[f].enabled)}
                  onChange={(e) => {
                    set({
                      ...policy,
                      [f]: { ...policy[f], [k]: e.target.checked },
                    });
                    note("");
                  }}
                />{" "}
                {j === 0
                  ? dictionaries[ar ? "ar" : "en"].workAssistantEnableFeature
                  : (dictionaries[ar ? "ar" : "en"].workAssistantAllowOpenai) +
                    sections[f][j === 1 ? 0 : 1][i]}
              </label>
            ))}
          </fieldset>
        ))
      ) : (
        <p>
          {q.isError
            ? dictionaries[ar ? "ar" : "en"].workAssistantSettingsUnavailable
            : "…"}
        </p>
      )}
      <Button
        disabled={!draft || busy}
        onClick={async () => {
          if (!draft) return;
          wait(true);
          try {
            await saveWorkPolicy({ data: draft });
            cache.setQueryData(["archy-work-policy"], draft);
            set(null);
            note(dictionaries[ar ? "ar" : "en"].workAssistantTaskPermissionsSaved);
          } catch {
            note(dictionaries[ar ? "ar" : "en"].workAssistantSaveFailed);
          } finally {
            wait(false);
          }
        }}
      >
        {dictionaries[ar ? "ar" : "en"].workAssistantSaveTaskPermissions}
      </Button>
      <p role="status">{status}</p>
    </section>
  );
}

export function CloudOption({
  feature,
  ar,
  context,
  content,
  onApply,
}: {
  feature: Feature;
  ar: boolean;
  context: string;
  content: string;
  onApply?: (value: string) => void;
}) {
  const { data } = useWorkPolicy(),
    [busy, wait] = useState(false),
    [message, set] = useState(""),
    [model, setModel] = useState("");
  const input = {
    feature,
    lang: ar ? ("ar" as const) : ("en" as const),
    context: context.slice(0, 1200),
    content: content.slice(0, 8000),
  };
  if (!data) return null;
  const fields = permittedFields(input, data);
  if (!Object.keys(fields).length) return null;
  return (
    <details className="mt-3">
      <summary>{dictionaries[ar ? "ar" : "en"].workAssistantRefineWithOpenai}</summary>
      <p>
        {dictionaries[ar ? "ar" : "en"].workAssistantTextThatWillBe}
      </p>
      <pre className="whitespace-pre-wrap break-words">
        {Object.values(fields).join("\n")}
      </pre>
      <Button
        disabled={busy}
        onClick={async () => {
          wait(true);
          set("");
          setModel("");
          try {
            const fn = feature === "issue" ? issueCompletion : workCompletion;
            const res = await fn({
              data: {
                ...input,
                context: fields.context ?? "",
                content: fields.content ?? "",
              },
            });
            set(res.body);
            setModel(res.model);
          } catch {
            set(
              dictionaries[ar ? "ar" : "en"].workAssistantOpenaiIsUnavailableThe,
            );
          } finally {
            wait(false);
          }
        }}
      >
        {busy ? "…" : dictionaries[ar ? "ar" : "en"].workAssistantConfirmAndSend}
      </Button>
      <div role="status" className="whitespace-pre-wrap">
        {model && (
          <b>
            OpenAI · {model}
            <br />
          </b>
        )}
        {message}
      </div>
      {model && onApply && (
        <Button variant="outline" onClick={() => onApply(message)}>
          {dictionaries[ar ? "ar" : "en"].workAssistantUseTextInDraft}
        </Button>
      )}
    </details>
  );
}
