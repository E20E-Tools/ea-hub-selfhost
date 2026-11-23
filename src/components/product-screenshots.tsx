import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type Shot = { url: string; caption: string };

/**
 * A small gallery of real screenshots from inside the tool. Clicking one opens it full size;
 * arrow keys and the side buttons move between shots. Renders nothing without screenshots.
 */
export function ProductScreenshots({
  shots,
  productName,
  ar,
  className = "",
  heading,
}: {
  shots: Shot[];
  productName: string;
  ar: boolean;
  className?: string;
  heading?: React.ReactNode;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (!shots.length) return null;
  const label = (i: number) =>
    shots[i]!.caption ||
    (ar
      ? `لقطة ${i + 1} من ${productName}`
      : `${productName} screenshot ${i + 1}`);
  const step = (delta: number) =>
    setOpen((i) =>
      i === null ? i : (i + delta + shots.length) % shots.length,
    );
  const Prev = ar ? ChevronRight : ChevronLeft;
  const Next = ar ? ChevronLeft : ChevronRight;
  return (
    <section
      className={`ea-shots ${className}`}
      aria-label={ar ? "لقطات من الأداة" : "Screenshots"}
    >
      {heading ?? (
        <h2 className="ea-shots-title">
          {ar ? "من داخل الأداة" : "Inside the tool"}
        </h2>
      )}
      <ul className="ea-shots-grid" data-count={Math.min(shots.length, 3)}>
        {shots.map((shot, i) => (
          <li key={shot.url}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              aria-label={`${label(i)} — ${ar ? "عرض بالحجم الكامل" : "view full size"}`}
            >
              <img src={shot.url} alt="" loading="lazy" decoding="async" />
            </button>
            {shot.caption && <p>{shot.caption}</p>}
          </li>
        ))}
      </ul>
      <Dialog open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        {open !== null && (
          <DialogContent
            className="ea-shots-viewer max-w-[min(1100px,94vw)] p-3"
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") step(ar ? -1 : 1);
              if (e.key === "ArrowLeft") step(ar ? 1 : -1);
            }}
          >
            <DialogTitle className="text-sm font-medium">
              {label(open)}
            </DialogTitle>
            <img
              src={shots[open]!.url}
              alt={label(open)}
              className="max-h-[78vh] w-full rounded-md object-contain"
            />
            {shots.length > 1 && (
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="ea-shots-nav"
                  onClick={() => step(-1)}
                  aria-label={ar ? "اللقطة السابقة" : "Previous screenshot"}
                >
                  <Prev size={18} aria-hidden />
                </button>
                <span className="text-xs text-muted-foreground" dir="ltr">
                  {open + 1} / {shots.length}
                </span>
                <button
                  type="button"
                  className="ea-shots-nav"
                  onClick={() => step(1)}
                  aria-label={ar ? "اللقطة التالية" : "Next screenshot"}
                >
                  <Next size={18} aria-hidden />
                </button>
              </div>
            )}
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}
