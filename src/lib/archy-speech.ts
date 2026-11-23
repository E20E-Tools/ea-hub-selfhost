import type { Language } from "./language-core";

/** Arabic prefers a Saudi voice, then any Arabic voice; English requires an English voice. */
export function pickArchyVoice(
  voices: readonly SpeechSynthesisVoice[],
  language: Language,
): SpeechSynthesisVoice | null {
  const available = voices.filter((voice) => voice.lang.toLowerCase().startsWith(language));
  if (language === "ar") {
    return (
      available.find((voice) => voice.lang.toLowerCase().replace("_", "-") === "ar-sa") ??
      available[0] ??
      null
    );
  }
  return available[0] ?? null;
}
