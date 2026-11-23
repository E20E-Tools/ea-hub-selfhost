import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const sizes: Record<string, number> = { radar: 4, landscape: 4, archone: 3 };
export const exerciseKey = (id: string) => "ea-hub:exercise:v1:" + id;
type Exercise = { name: string; values: string[]; result: string; language: "ar" | "en" };

export function readExercise(id: string): Exercise | null {
  try {
    const data = JSON.parse(localStorage.getItem(exerciseKey(id)) ?? "null");
    return data && typeof data.name === "string" && typeof data.result === "string" &&
      ["ar","en"].includes(data.language) && Array.isArray(data.values) && data.values.length === sizes[id] &&
      data.values.every((value: unknown) => typeof value === "string" && value.length <= 240) ? data : null;
  } catch { return null; }
}

export function SavedExercises({ ar }: { ar: boolean }) {
  const [ids, setIds] = useState<string[]>([]);
  const [error,setError] = useState(false);
  useEffect(() => {
    const refresh = () => setIds(Object.keys(sizes).filter(id => readExercise(id)));
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);
  if (!ids.length) return null;
  return <section className="bx-panel"><h2>{ar ? "تماريني على هذا الجهاز" : "My exercises on this device"}</h2>
    {ids.map(id => <div className="bx-actions" key={id}>
      <a href={`/product/${id}?resume=exercise#exercise`}>{ar ? "متابعة التمرين" : "Resume exercise"} · {readExercise(id)?.name}</a>
      <Button variant="outline" onClick={() => {
        try { localStorage.removeItem(exerciseKey(id)); setIds(old => old.filter(item => item !== id)); }
        catch { setError(true); }
      }}>{ar ? "حذف التمرين" : "Delete exercise"}</Button>
    </div>)}{error && <p role="alert">{ar ? "تعذر حذف التمرين." : "Could not delete the exercise."}</p>}</section>;
}
