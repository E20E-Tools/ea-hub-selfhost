import { Languages } from "lucide-react";
import { useLanguage, type Language } from "@/lib/language";

const choices: { id: Language; label: string }[] = [
  { id: "ar", label: "العربية" },
  { id: "en", label: "English" },
];

/** Slim bar across the top of every visitor page: the visitor picks their language. */
export function LanguageSwitcher({ inline = false }: { inline?: boolean }) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className={inline ? "language-inline" : "language-bar"} dir="ltr">
      <Languages size={14} aria-hidden="true" />
      <div
        className="language-choices"
        role="group"
        aria-label={t("langSwitchLabel")}
      >
        {choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            className="language-choice"
            aria-pressed={language === choice.id}
            onClick={() => setLanguage(choice.id)}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}
