import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { introVideo, IntroVideoButton, IntroVideoCard } from "@/components/intro-video";
import { showsIntroVideo } from "@/components/site-header";
import { dictionaries } from "@/lib/copy";
import { normalizeFeatureFlags } from "@/lib/site-features";

afterEach(cleanup);

describe("header introduction video button", () => {
  it("plays the same film the About us page shows", () => {
    for (const language of ["ar", "en"] as const) {
      const film = introVideo(language);
      expect(film.mp4).toMatch(/\/e20e-launch-60s\.mp4$/);
      expect(film.guide).toBe(`/guide/${language}.html`);
    }
  });

  it("is named in both languages", () => {
    expect(dictionaries.ar.introVideoCta).toBe("الفيديو التعريفي");
    expect(dictionaries.en.introVideoCta).toBe("Intro video");
  });

  it("opens the film in a dialog and closes it again", () => {
    render(<IntroVideoButton />);
    fireEvent.click(screen.getByRole("button", { name: "Intro video" }));
    const dialog = screen.getByRole("dialog");
    const player = dialog.querySelector("video");
    expect(player?.getAttribute("poster")).toBe(introVideo("en").poster);
    expect([...dialog.querySelectorAll("source")].map((s) => s.getAttribute("src"))).toEqual([
      introVideo("en").mp4,
      introVideo("en").webm,
    ]);
    expect(dialog.querySelector("track[default]")?.getAttribute("srclang")).toBe("en");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("follows the About us feature switch", () => {
    expect(showsIntroVideo(normalizeFeatureFlags(undefined))).toBe(true);
    expect(showsIntroVideo(normalizeFeatureFlags({ blog: false }))).toBe(false);
    expect(showsIntroVideo(normalizeFeatureFlags({ roadmap: false }))).toBe(true);
  });
});

describe("About us short-film card", () => {
  it("opens the same one-minute film from the poster and from the link", () => {
    render(<IntroVideoCard />);
    const plays = screen.getAllByRole("button", { name: "Play the short video" });
    expect(plays).toHaveLength(2);
    for (const play of plays) {
      fireEvent.click(play);
      const dialog = screen.getByRole("dialog");
      expect(dialog.querySelector("source")?.getAttribute("src")).toBe(introVideo("en").mp4);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
    }
  });

  it("says the film is short and localized, in both languages", () => {
    expect(dictionaries.ar.aboutFilmMeta).toBe("الفيديو التعريفي · دقيقة واحدة · بالإنجليزية مع ترجمة عربية");
    expect(dictionaries.en.aboutFilmMeta).toBe("Introduction · One minute · English with subtitles");
  });
});
