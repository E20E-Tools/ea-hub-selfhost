import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquareText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeQuestion } from "@/lib/chat-feedback.shared";
import { EmptyBlock, ErrorBlock, LoadingBlock, useAdminCopy } from "./ui";

export function FaqReplies({
  onChoose,
}: {
  onChoose: (answer: string) => void;
}) {
  const { t } = useAdminCopy();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["admin", "faq-replies"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faq_answers")
        .select("id,question,answer")
        .eq("enabled", true)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const rows = useMemo(
    () =>
      (query.data ?? []).filter((r) =>
        normalizeQuestion(`${r.question} ${r.answer}`).includes(
          normalizeQuestion(search),
        ),
      ),
    [query.data, search],
  );
  return (
    <div className="border-t border-border px-3 py-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <MessageSquareText className="size-4" />
        {t("fbAnswers")}
      </Button>
      {open ? (
        <div className="mt-3 grid gap-2">
          <Input
            aria-label={t("fbSearch")}
            placeholder={t("fbSearch")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {query.isPending ? (
            <LoadingBlock rows={2} />
          ) : query.isError ? (
            <ErrorBlock onRetry={() => void query.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyBlock text={t("noMatches")} />
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {rows.map((r) => (
                <li key={r.id} className="border-b border-border py-2 text-sm">
                  <strong className="block break-words" dir="auto">
                    {r.question}
                  </strong>
                  <p
                    className="my-2 whitespace-pre-wrap break-words text-muted-foreground"
                    dir="auto"
                  >
                    {r.answer}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      onChoose(r.answer);
                      setOpen(false);
                    }}
                  >
                    {t("fbUseAnswer")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
