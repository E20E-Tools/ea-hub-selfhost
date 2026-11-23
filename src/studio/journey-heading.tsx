import { Link } from "@tanstack/react-router";
import { Bookmark, Compass, GitCompareArrows } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLanguage } from "@/lib/language";
import { useFeature } from "@/lib/use-feature";

type ToolView = "discover" | "compare" | "my-tools";
const destinations = [
  { id: "discover", feature: "discover", to: "/discover", label: { ar: "اكتشف", en: "Discover" }, icon: Compass },
  {
    id: "compare",
    feature: "compare",
    to: "/compare",
    label: { ar: "قارن", en: "Compare" },
    icon: GitCompareArrows,
  },
  { id: "my-tools", feature: "myTools", to: "/my-tools", label: { ar: "المحفوظات", en: "Saved tools" }, icon: Bookmark },
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
  return (
    <header className="ea-journey-heading">
      <div className="ea-journey-intro">
        <Icon size={28} strokeWidth={1.5} aria-hidden="true" />
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      {view && <JourneyNav view={view} />}
    </header>
  );
}

/** Tool workspace links; a switched-off feature drops its link, and one link alone is not a menu. */
function JourneyNav({ view }: { view: ToolView }) {
  const { language } = useLanguage();
  const enabled = {
    discover: useFeature("discover"),
    compare: useFeature("compare"),
    myTools: useFeature("myTools"),
  };
  const links = destinations.filter((item) => enabled[item.feature]);
  if (links.length < 2) return null;
  return (
    <nav aria-label={language === "ar" ? "مسارات الأدوات" : "Tool workspace"}>
      {links.map((item) => (
        <Link key={item.id} to={item.to} aria-current={view === item.id ? "page" : undefined}>
          <item.icon size={16} aria-hidden="true" />
          {item.label[language]}
        </Link>
      ))}
    </nav>
  );
}
