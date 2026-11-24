import { useState } from "react";
import { Button } from "@/components/ui/button";
import { openAssistantWindow } from "@/lib/assistant-events";
import type { Product } from "@/lib/products";

export function StepHelp({ product, ar, step, result = "" }: { product: Product; ar: boolean; step: string; result?: string }) {
  const [message, setMessage] = useState((ar ? "أحتاج مساعدة في " : "I need help with ") + product.name + " — " + step);
  const [include,setInclude] = useState(false);
  const [error,setError] = useState(false);
  const draft = [message.trim(), include ? result : ""].filter(Boolean).join("\n\n");
  function support() {
    try {
      const key = crypto.randomUUID();
      sessionStorage.setItem("ea-step-help:" + key, draft);
      const search = new URLSearchParams({type:"support",product:product.id});
      window.location.assign("/request?" + search + "#step-" + key);
    } catch { setError(true); }
  }
  return <details className="ea-step-help"><summary>{ar ? "أحتاج مساعدة في هذه الخطوة" : "I need help with this step"}</summary>
    <label>{ar ? "راجع سؤالك" : "Review your question"}<textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={1200}/></label>
    {result && <label><input type="checkbox" checked={include} onChange={e => setInclude(e.target.checked)}/> {ar ? "أرفق نتيجة التمرين" : "Include exercise result"}</label>}
    {draft.length > 1200 && <p>{ar ? "اختصر السؤال أو افتح طلب دعم لإرفاق النتيجة كاملة." : "Shorten the question or open a support request to include the full result."}</p>}
    <div className="bx-actions"><Button variant="outline" disabled={!message.trim() || draft.length > 1200} onClick={() => openAssistantWindow(draft)}>{ar ? "اسأل Archy" : "Ask Archy"}</Button>
    <Button variant="outline" disabled={!message.trim()} onClick={support}>{ar ? "فتح طلب دعم" : "Open support request"}</Button></div>
    {error && <p role="alert">{ar ? "تعذر فتح المسودة. انسخ سؤالك إلى صفحة الدعم." : "Could not open the draft. Copy your question to the support page."}</p>}
  </details>;
}
