import { useEffect } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { catalogQueryOptions } from "@/lib/catalog.functions";

/** Applies the admin's product-image motion settings (on/off, speed, direction) site-wide. */
export function ProductMotion() {
  const { data } = useSuspenseQuery(catalogQueryOptions);
  const { motionEnabled, motionSpeed, motionDirection } = data.settings;

  const { imageFit, imageBrightness, imageContrast, imageSaturation, imageSharpen } = data.settings;
  useEffect(() => {
    const root = document.documentElement;
    root.dataset["productImageFit"] = imageFit;
    root.dataset["productImageSharpen"] = imageSharpen ? "on" : "off";
    root.style.setProperty(
      "--product-image-filter",
      `brightness(${imageBrightness}) contrast(${imageContrast}) saturate(${imageSaturation})`,
    );
  }, [imageFit, imageBrightness, imageContrast, imageSaturation, imageSharpen]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset["productMotion"] = motionEnabled ? motionDirection : "off";
    if (!motionEnabled) return;
    // Speed scales every running card animation without rewriting each keyframe duration.
    let frame = 0;
    const apply = () => {
      frame = 0;
      if (typeof document.getAnimations !== "function") return;
      for (const animation of document.getAnimations()) {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        if (target instanceof Element && target.closest(".product-card")) {
          animation.playbackRate = motionSpeed;
        }
      }
    };
    apply();
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(apply);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [motionEnabled, motionSpeed, motionDirection]);

  return null;
}
