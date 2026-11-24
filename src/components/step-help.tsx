import { useState } from "react";
import { Button } from "@/components/ui/button";
import { openAssistantWindow } from "@/lib/assistant-events";
import type { Product } from "@/lib/products";
import { dictionaries } from "@/lib/copy";

export function StepHelp({
  product,
  ar,
  step,
  result = "",
}: {
  product: Product;
  ar: boolean;
  step: string;
  result?: string;
}) {
  const [message, setMessage] = useState(
    dictionaries[ar ? "ar" : "en"].stepHelpINeedHelpWith +
      product.name +
      " — " +
      step,
  );
  const [include, setInclude] = useState(false);
  const [error, setError] = useState(false);
  const draft = [message.trim(), include ? result : ""]
    .filter(Boolean)
    .join("\n\n");
  function support() {
    try {
      const key = crypto.randomUUID();
      sessionStorage.setItem("ea-step-help:" + key, draft);
      const search = new URLSearchParams({
        type: "support",
        product: product.id,
      });
      window.location.assign("/request?" + search + "#step-" + key);
    } catch {
      setError(true);
    }
  }
  return (
    <details className="ea-step-help">
      <summary>{dictionaries[ar ? "ar" : "en"].stepHelpINeedHelpWith2}</summary>
      <label>
        {dictionaries[ar ? "ar" : "en"].stepHelpReviewYourQuestion}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={1200}
        />
      </label>
      {result && (
        <label>
          <input
            type="checkbox"
            checked={include}
            onChange={(e) => setInclude(e.target.checked)}
          />{" "}
          {dictionaries[ar ? "ar" : "en"].stepHelpIncludeExerciseResult}
        </label>
      )}
      {draft.length > 1200 && (
        <p>{dictionaries[ar ? "ar" : "en"].stepHelpShortenTheQuestionOr}</p>
      )}
      <div className="bx-actions">
        <Button
          variant="outline"
          disabled={!message.trim() || draft.length > 1200}
          onClick={() => openAssistantWindow(draft)}
        >
          {dictionaries[ar ? "ar" : "en"].stepHelpAskArchy}
        </Button>
        <Button variant="outline" disabled={!message.trim()} onClick={support}>
          {dictionaries[ar ? "ar" : "en"].stepHelpOpenSupportRequest}
        </Button>
      </div>
      {error && (
        <p role="alert">
          {dictionaries[ar ? "ar" : "en"].stepHelpCouldNotOpenThe}
        </p>
      )}
    </details>
  );
}
