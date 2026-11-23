import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Layers3,
  Menu,
  X,
  Palette,
  Check,
  Compass,
  BriefcaseBusiness,
  Building2,
} from "lucide-react";
import { useLanguage } from "@/lib/language";
import { SiteSearch } from "@/components/site-search";
import { catalogQueryOptions } from "@/lib/catalog.functions";
import { localizedSettings } from "@/lib/catalog";
import { linkedFooterParts } from "@/lib/footer-links";
import { placedNavigation, navigationLabel } from "@/lib/navigation.shared";
import { isDisabledFeaturePath } from "@/lib/site-features";
import {
  chooseDirection,
  directions,
  useDirection,
  type DirectionId,
} from "./directions";

type NavLink = { to: string; label: string; cta?: boolean };
function useNavigation() {
  const { data } = useSuspenseQuery(catalogQueryOptions);
  const { language } = useLanguage();
  const s = localizedSettings(data.settings, language);
  const entries = placedNavigation(s.navigationItems)
    .filter((i) => !i.hidden && !isDisabledFeaturePath(s.featureFlags, i.url))
    .map((i) => ({
      id: i.id,
      group: i.group,
      topBar: i.topBar,
      to: i.url,
      label: navigationLabel(i, language),
      cta: i.cta,
    }));
  return { s, entries };
}
function Brand() {
  const { s } = useNavigation();
  return (
    <a className="nx-brand" href="/" aria-label={s.displayTitle || "EA-Hub"}>
      <span className="nx-brand-mark">
        {s.logoUrl ? (
          <img src={s.logoUrl} alt="" width={62} height={46} />
        ) : (
          <Layers3 aria-hidden="true" />
        )}
      </span>
      <span className="nx-brand-type">
        <b dir="auto">{s.displayTitle || "EA-Hub"}</b>
        {s.tagline && <small dir="auto">{s.tagline}</small>}
      </span>
    </a>
  );
}
function NavGroup({
  title,
  links,
  icon: Icon,
  path,
  close,
}: {
  title: string;
  links: NavLink[];
  icon: typeof Compass;
  path: string;
  close?: () => void;
}) {
  if (!links.length) return null;
  return (
    <section>
      <h2>
        <Icon size={17} aria-hidden="true" />
        {title}
      </h2>
      {links.map((l, i) => (
        <a
          key={l.to + i}
          href={l.to}
          aria-current={l.to === path ? "page" : undefined}
          onClick={close}
        >
          {l.label}
          <ArrowUpRight size={13} />
        </a>
      ))}
    </section>
  );
}
export function StudioHeader() {
  const { entries: configured } = useNavigation();
  const { t, language, arabicAvailable, setLanguage } = useLanguage();
  const ar = language === "ar";
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const direction = useDirection();
  const [local, setLocal] = useState(false);
  useEffect(() => {
    setLocal(["127.0.0.1", "localhost"].includes(location.hostname));
  }, []);
  useEffect(() => {
    if (!open) return;
    const closeKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const outside = (e: PointerEvent) => {
      if (!header.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", closeKey);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", closeKey);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  const entries = configured.filter(
    (item) => local || item.to.split(/[?#]/)[0] !== "/design-lab",
  );
  const main = entries.filter((item) => item.topBar);
  return (
    <header ref={header} className="s-header nx-head">
      <a className="skip-link" href="#main-content">
        {t("skipToContent")}
      </a>
      <div className="nx-headrow">
        <Brand />
        <nav className="nx-primary" aria-label={t("navigationLabel")}>
          {main.map((i) => (
            <a
              href={i.to}
              key={i.id}
              className={i.cta ? "nx-nav-highlight" : undefined}
              aria-current={i.to === path ? "page" : undefined}
            >
              {i.label}
            </a>
          ))}
        </nav>
        <div className="nx-actions s-actions">
          <SiteSearch
            pages={entries.filter(
              (item) => item.topBar || item.group !== "none",
            )}
          />
          {arabicAvailable && (
            <button
              className="s-language"
              lang={ar ? "en" : "ar"}
              onClick={() => setLanguage(ar ? "en" : "ar")}
            >
              {ar ? "EN" : "عربي"}
            </button>
          )}
          <button
            ref={button}
            className="s-menu"
            aria-expanded={open}
            aria-controls="network-menu"
            aria-label={ar ? "قائمة المنصة" : "Platform menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          className="nx-mega"
          id="network-menu"
          aria-label={ar ? "خريطة الموقع" : "Site directory"}
        >
          <NavGroup
            title={ar ? "المنصة والخدمات" : "Platform & services"}
            links={entries.filter((item) => item.group === "platform")}
            icon={Compass}
            path={path}
            close={() => setOpen(false)}
          />
          <NavGroup
            title={ar ? "مساحة العمل" : "Workspace"}
            links={entries.filter((item) => item.group === "workspace")}
            icon={BriefcaseBusiness}
            path={path}
            close={() => setOpen(false)}
          />
          <NavGroup
            title={ar ? "عن الشركة والتواصل" : "Company & contact"}
            links={entries.filter((item) => item.group === "company")}
            icon={Building2}
            path={path}
            close={() => setOpen(false)}
          />
          <section className="nx-looks">
            <h2>
              <Palette size={17} />
              {ar ? "مظهر هذا الجهاز" : "Appearance on this device"}
            </h2>
            {(Object.keys(directions) as DirectionId[]).map((id) => (
              <button
                aria-pressed={direction === id}
                key={id}
                onClick={() => chooseDirection(id)}
              >
                <i data-swatch={id} />
                {directions[id][language]}
                {direction === id && (
                  <Check
                    className="nx-look-check"
                    size={16}
                    aria-hidden="true"
                  />
                )}
              </button>
            ))}
            {entries
              .filter((item) => item.group === "appearance")
              .map((item) => (
                <a
                  key={item.id}
                  href={item.to}
                  aria-current={item.to === path ? "page" : undefined}
                >
                  {item.label}
                  <ArrowUpRight size={14} />
                </a>
              ))}
          </section>
        </nav>
      )}
    </header>
  );
}
export function StudioFooter() {
  const { data } = useSuspenseQuery(catalogQueryOptions);
  const { language } = useLanguage();
  const s = localizedSettings(data.settings, language);
  return (
    <footer className="nx-foot">
      <p dir="auto">
        {linkedFooterParts(s.footerText, s.footerLinks ?? []).map((part, i) =>
          part.url ? (
            <a
              href={part.url}
              key={i}
              target="_blank"
              rel="noopener noreferrer"
            >
              {part.text}
            </a>
          ) : (
            part.text
          ),
        )}
      </p>
    </footer>
  );
}
