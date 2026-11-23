import { Link } from "@tanstack/react-router";
import { Bookmark, Compass, GitCompareArrows } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLanguage } from "@/lib/language";

type ToolView = "discover" | "compare" | "my-tools";
const destinations = [
  { id: "discover", to: "/discover", label: { ar: "اكتشف", en: "Discover" }, icon: Compass },
  {
    id: "compare",
    to: "/compare",
    label: { ar: "قارن", en: "Compare" },
    icon: GitCompareArrows,
  },
  { id: "my-tools", to: "/my-tools", label: { ar: "المحفوظات", en: "Saved tools" }, icon: Bookmark },
] as const;

export function JourneyHeading({
  title,
  description,
  icon: Icon,
  view,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  view?: ToolView;
}) {
  const { language } = useLanguage();
  return (
    <header className="ea-journey-heading">
      <div className="ea-journey-intro">
        <Icon size={28} strokeWidth={1.5} aria-hidden="true" />
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      {view && (
        <nav
          aria-label={language === "ar" ? "مسارات الأدوات" : "Tool workspace"}
        >
          {destinations.map((item) => (
            <Link
              key={item.id}
              to={item.to}
              aria-current={view === item.id ? "page" : undefined}
            >
              <item.icon size={16} aria-hidden="true" />
              {item.label[language]}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
