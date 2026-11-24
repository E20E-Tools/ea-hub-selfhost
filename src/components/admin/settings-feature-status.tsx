import { useState } from "react";
import {
  ChevronDown,
  CircleCheck,
  CircleMinus,
  ExternalLink,
} from "lucide-react";
import type { FeatureKey } from "@/lib/site-features";
import type { Catalog } from "@/lib/catalog";
import { featureStatusRows } from "@/lib/feature-status";
import { Card, useAdminCopy } from "./ui";

export function FeatureStatus({
  catalog,
  onManage,
}: {
  catalog: Catalog;
  onManage: (feature: FeatureKey) => void;
}) {
  const { t, number } = useAdminCopy();
  const [filter, setFilter] = useState<"all" | "enabled" | "disabled">("all");
  const rows = featureStatusRows(catalog.settings.featureFlags);
  const enabled = rows.filter((row) => row.enabled).length;
  const counts = { all: rows.length, enabled, disabled: rows.length - enabled };
  const visible = rows.filter(
    (row) => filter === "all" || row.enabled === (filter === "enabled"),
  );
  return (
    <Card description={t("fsSavedNote")}>
      <div
        className="settings-state-filters"
        role="group"
        aria-label={t("tabFeatureStatus")}
      >
        {(["all", "enabled", "disabled"] as const).map((id) => (
          <button
            type="button"
            key={id}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {t(id)} <span>{number(counts[id])}</span>
          </button>
        ))}
      </div>
      {visible.length ? (
        <ul className="settings-state-list">
          {visible.map((row) => {
            const name = t(`feature_${row.key}`);
            const Status = row.enabled ? CircleCheck : CircleMinus;
            return (
              <li key={row.key}>
                <header>
                  <Status size={18} data-active={row.enabled} />
                  <div>
                    <h3>{name}</h3>
                    <small>{row.enabled ? t("enabled") : t("disabled")}</small>
                  </div>
                  <button
                    type="button"
                    onClick={() => onManage(row.key)}
                    aria-label={t("fsManageLabel", { name })}
                  >
                    {t("fsManage")}
                  </button>
                </header>
                <details>
                  <summary>
                    {t("settingsServiceDetails")}
                    <ChevronDown size={15} />
                  </summary>
                  <p>{t(`featureAbout_${row.key}`)}</p>
                  <p>
                    <strong>{t("fsWhenOff")}</strong>{" "}
                    {t(`feature_${row.key}Desc`)}
                  </p>
                  {row.path && (
                    <a href={row.path} target="_blank" rel="noreferrer">
                      <bdi>{row.path}</bdi>
                      <ExternalLink size={13} />
                    </a>
                  )}
                </details>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="settings-empty-state" role="status">
          {t("settingsFilterEmpty")}
        </p>
      )}
    </Card>
  );
}
