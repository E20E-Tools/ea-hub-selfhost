import { adminDictionaries } from "@/lib/admin-copy";
import { BilingualField, Card, useAdminCopy } from "./ui";
import {
  DISCOVERY_GOALS,
  EA_LAYERS,
  MATURITY_LEVELS,
  ORGANIZATION_SIZES,
  type BeneficiaryDetails,
} from "@/lib/beneficiary-metadata";

function toggle<T extends string>(values: T[], value: T, checked: boolean): T[] {
  return checked ? [...new Set([...values, value])] : values.filter((item) => item !== value);
}

export function ProductFitFields({
  value,
  onChange,
}: {
  value: BeneficiaryDetails;
  onChange: (value: BeneficiaryDetails) => void;
}) {
  const { t,language } = useAdminCopy();
  const ar=language==="ar";
  const op=value.operations??{account:{ar:"",en:""},inputs:{ar:"",en:""},exchange:{ar:"",en:""},reviewed:""};
  const opLabels={account:adminDictionaries[ar ? "ar" : "en"].consoleAccountRequirements,inputs:adminDictionaries[ar ? "ar" : "en"].consoleStartingData,exchange:adminDictionaries[ar ? "ar" : "en"].consoleVerifiedImportAndExportOptions};
  const groups = [
    {
      key: "goals" as const,
      legend: t("productFitGoals"),
      values: DISCOVERY_GOALS,
      selected: value.goals,
    },
    {
      key: "organizationSizes" as const,
      legend: t("productFitOrganizations"),
      values: ORGANIZATION_SIZES,
      selected: value.organizationSizes,
    },
    {
      key: "maturityLevels" as const,
      legend: t("productFitMaturity"),
      values: MATURITY_LEVELS,
      selected: value.maturityLevels,
    },
  ];
  const bilingual = (
    field: "audience" | "notFor" | "exampleOutput" | "problem",
    label: string,
    multiline = true,
  ) => (
    <BilingualField
      label={label}
      ar={value[field].ar}
      en={value[field].en}
      multiline={multiline}
      rows={3}
      maxLength={800}
      onChange={(next) => onChange({ ...value, [field]: next })}
    />
  );
  const bilingualList = (
    field: "prerequisites" | "integrations" | "limitations" | "purchaseSteps",
    label: string,
  ) => (
    <BilingualField
      label={label}
      hint={t("productFitListHint")}
      ar={value[field].ar.join("\n")}
      en={value[field].en.join("\n")}
      multiline
      rows={3}
      maxLength={2400}
      onChange={(next) =>
        onChange({
          ...value,
          [field]: {
            ar: next.ar
              .split("\n")
              .map((x) => x.trim())
              .filter(Boolean)
              .slice(0, 12),
            en: next.en
              .split("\n")
              .map((x) => x.trim())
              .filter(Boolean)
              .slice(0, 12),
          },
        })
      }
    />
  );
  return (
    <Card title={t("productBeneficiaryFit")} description={t("productBeneficiaryFitHint")}>
      <div className="grid gap-6">
        <fieldset className="grid gap-3"><legend>{adminDictionaries[ar ? "ar" : "en"].consoleOperatingRequirements}</legend>
        {(["account","inputs","exchange"] as const).map(key=><BilingualField key={key} label={opLabels[key]} ar={op[key].ar} en={op[key].en} maxLength={800} onChange={v=>onChange({...value,operations:{...op,[key]:v}})}/>)}
        <label>{adminDictionaries[ar ? "ar" : "en"].consoleLastVerified}<input type="date" value={op.reviewed} onChange={e=>onChange({...value,operations:{...op,reviewed:e.target.value}})}/></label>
        {op.reviewed && Date.parse(op.reviewed)<Date.now()-90*86400000 && <p>{adminDictionaries[ar ? "ar" : "en"].consoleLastVerifiedOver90DaysAgo}</p>}</fieldset>
        {groups.map((group) => (
          <fieldset key={group.key}>
            <legend className="mb-2 text-sm font-medium">{group.legend}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {group.values.map((option) => (
                <label key={option} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={group.selected.includes(option as never)}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        [group.key]: toggle(
                          group.selected as string[],
                          option,
                          event.target.checked,
                        ),
                      })
                    }
                  />
                  {t(`productFit_${option}`)}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {bilingual("audience", t("productFitAudience"))}
        {bilingual("notFor", t("productFitNotFor"))}
        {bilingualList("prerequisites", t("productFitPrerequisites"))}
        {bilingualList("integrations", t("productFitIntegrations"))}
        {bilingualList("limitations", t("productFitLimitations"))}
        {bilingual("exampleOutput", t("productFitExample"))}
        {bilingualList("purchaseSteps", t("productFitPurchaseSteps"))}
        <p className="-mt-4 text-xs text-muted-foreground">{t("productFitPurchaseStepsHint")}</p>
        {bilingual("problem", t("productFitProblem"), false)}
        <p className="-mt-4 text-xs text-muted-foreground">{t("productFitProblemHint")}</p>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{t("productFitLayer")}</span>
          <select
            className="h-9 rounded-md border bg-background px-2"
            value={value.eaLayer}
            onChange={(event) =>
              onChange({ ...value, eaLayer: event.target.value as BeneficiaryDetails["eaLayer"] })
            }
          >
            <option value="">{t("productFitLayerAuto")}</option>
            {EA_LAYERS.map((layer) => (
              <option key={layer} value={layer}>
                {t(`productFitLayer_${layer}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Card>
  );
}
