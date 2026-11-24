import { useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/lib/language";
import { cn } from "@/lib/utils";
import introMp4 from "@/assets/e20e-launch-60s.mp4.asset.json";
import introWebm from "@/assets/e20e-launch-60s.webm.asset.json";
import introPoster from "@/assets/e20e-launch-poster.jpg.asset.json";

export function introVideo(language: "ar" | "en") {
  return {
    mp4: introMp4.url,
    webm: introWebm.url,
    poster: introPoster.url,
    guide: `/guide/${language}.html`,
  };
}

/**
 * Dialog with the introduction film. Playback starts from the click that
 * opened it; when a browser refuses, the player waits for the visitor's press.
 */
export function IntroVideoDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { dir, language, t } = useLanguage();

  const film = introVideo(language);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="intro-video-dialog" dir={dir}>
        <DialogTitle>{t("blogVideo")}</DialogTitle>
        <video
          autoPlay
          className="intro-video-player"
          controls
          playsInline
          preload="metadata"
          poster={film.poster}
          aria-label={t("blogVideo")}
        >
          <source src={film.mp4} type="video/mp4" />
          <source src={film.webm} type="video/webm" />
          <track
            kind="subtitles"
            src="/captions/intro-ar.vtt"
            srcLang="ar"
            label="العربية"
            default={language === "ar"}
          />
          <track
            kind="subtitles"
            src="/captions/intro-en.vtt"
            srcLang="en"
            label="English"
            default={language === "en"}
          />
          <a href={film.mp4}>{t("blogVideoFallback")}</a>
        </video>
        <a className="underline underline-offset-4" href={film.guide}>
          {language === "ar"
            ? "اقرأ دليل الاستخدام المصوّر"
            : "Read the illustrated user guide"}
        </a>
      </DialogContent>
    </Dialog>
  );
}

/** Header button beside the search: opens the introduction film in a dialog. */
export function IntroVideoButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("site-intro-trigger", className)}
        onClick={() => setOpen(true)}
        aria-label={t("introVideoCta")}
      >
        <Play size={15} aria-hidden="true" />
        <span className="site-intro-label">{t("introVideoCta")}</span>
      </Button>
      <IntroVideoDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/** About us card beside the heading: the film's poster, its length and a play link. */
export function IntroVideoCard({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { language, t } = useLanguage();

  const film = introVideo(language);
  return (
    <aside
      className={cn("about-film", className)}
      aria-labelledby="about-film-title"
    >
      <button
        type="button"
        className="about-film-poster"
        onClick={() => setOpen(true)}
        aria-label={t("aboutFilmPlay")}
      >
        <img src={film.poster} alt="" width={640} height={360} loading="lazy" />
        <span className="about-film-play" aria-hidden="true">
          <Play size={22} />
        </span>
        <span className="about-film-length" aria-hidden="true">
          1:00
        </span>
      </button>
      <div className="about-film-copy">
        <h2 id="about-film-title">{t("aboutFilmTitle")}</h2>
        <button
          className="underline underline-offset-4"
          type="button"
          onClick={() => setOpen(true)}
        >
          {t("aboutFilmPlay")}
        </button>
        <p>{t("aboutFilmMeta")}</p>
        <a className="block underline underline-offset-4" href={film.guide}>
          {language === "ar"
            ? "دليل الاستخدام المصوّر"
            : "Illustrated user guide"}
        </a>
      </div>
      <IntroVideoDialog open={open} onOpenChange={setOpen} />
    </aside>
  );
}
