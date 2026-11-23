import { useCallback, useEffect, useRef, useState } from "react";
import { ARCHY_MUTED_STORAGE_KEY } from "./archy-mascot";
import { pickArchyVoice } from "./archy-speech";
import type { Language } from "./language-core";

export type ArchySpeechStatus = "idle" | "speaking" | "unavailable";

export type ArchyVoiceOptions = { voiceOn?: boolean; rate?: number; pitch?: number };

export function useArchySpeech(language: Language, text: string, options: ArchyVoiceOptions = {}) {
  const { voiceOn = true, rate = 0.96, pitch = 1.02 } = options;
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState<ArchySpeechStatus>("idle");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const generation = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    try {
      // The visitor's own saved choice wins; otherwise the admin default applies.
      const saved = window.localStorage.getItem(ARCHY_MUTED_STORAGE_KEY);
      setMuted(saved === "muted" || (saved !== "on" && !voiceOn));
    } catch {
      // Sound remains available without persistence in private browsing.
    }
    return () => {
      mounted.current = false;
    };
  }, [voiceOn]);

  const cancel = useCallback(() => {
    generation.current += 1;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // Speech is optional; the written greeting remains available.
    }
    if (mounted.current) setStatus("idle");
  }, []);

  // Voices often arrive after page load, especially on mobile browsers.
  useEffect(() => {
    const synthesis = window.speechSynthesis;
    if (!synthesis) return;
    const loadVoices = () => {
      try {
        setVoices(synthesis.getVoices());
      } catch {
        setStatus("unavailable");
      }
    };
    loadVoices();
    try {
      synthesis.addEventListener?.("voiceschanged", loadVoices);
    } catch {
      /* optional API */
    }
    return () => {
      try {
        synthesis.removeEventListener?.("voiceschanged", loadVoices);
      } catch {
        /* optional API */
      }
      generation.current += 1;
      try {
        synthesis.cancel();
      } catch {
        /* optional API */
      }
    };
  }, [language]);

  useEffect(() => {
    cancel();
  }, [language, muted, text, cancel]);

  const replay = useCallback(() => {
    if (muted) return;
    const synthesis = window.speechSynthesis;
    const Utterance = window.SpeechSynthesisUtterance;
    if (!synthesis || !Utterance) {
      setStatus("unavailable");
      return;
    }
    try {
      const currentVoices = synthesis.getVoices();
      const voice = pickArchyVoice(currentVoices.length > 0 ? currentVoices : voices, language);
      if (!voice) {
        setStatus("unavailable");
        return;
      }

      const ownGeneration = ++generation.current;
      synthesis.cancel();
      const utterance = new Utterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.onend = () => {
        if (mounted.current && generation.current === ownGeneration) setStatus("idle");
      };
      utterance.onerror = () => {
        if (mounted.current && generation.current === ownGeneration) setStatus("unavailable");
      };
      synthesis.speak(utterance);
      setStatus("speaking");
    } catch {
      setStatus("unavailable");
    }
  }, [language, muted, pitch, rate, text, voices]);

  const toggleMuted = useCallback(() => {
    setMuted((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(ARCHY_MUTED_STORAGE_KEY, next ? "muted" : "on");
      } catch {
        // The current tab still respects the choice.
      }
      return next;
    });
  }, []);

  return { muted, status, replay, cancel, toggleMuted };
}
