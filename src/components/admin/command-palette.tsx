import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { adminDictionaries } from "@/lib/admin-copy";
import {
  ADMIN_NAV,
  ADMIN_SECTION_TABS,
  TAB_LABELS,
} from "@/lib/admin-sections";
import type { Go } from "./shell";
import { useAdminCopy } from "./ui";

/** Ctrl/Cmd+K: jump to any section or tab; matches the Arabic and English names alike. */
export function CommandPalette({
  open,
  onOpenChange,
  go,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  go: Go;
}) {
  const { t, dir } = useAdminCopy();
  const both = (key: keyof (typeof adminDictionaries)["en"]) =>
    `${adminDictionaries.ar[key]} ${adminDictionaries.en[key]}`;
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("commandOpen")}
      dir={dir}
    >
      <CommandInput placeholder={t("commandPlaceholder")} />
      <CommandList>
        <CommandEmpty>{t("commandEmpty")}</CommandEmpty>
        {ADMIN_NAV.flatMap((group) => group.items).map((item) => (
          <CommandGroup key={item.id} heading={t(item.label)}>
            <CommandItem
              value={both(item.label)}
              onSelect={() => {
                onOpenChange(false);
                go(item.id);
              }}
            >
              {t(item.label)}
            </CommandItem>
            {ADMIN_SECTION_TABS[item.id].map((tab) => (
              <CommandItem
                key={tab}
                value={`${both(item.label)} ${both(TAB_LABELS[tab])}`}
                onSelect={() => {
                  onOpenChange(false);
                  go(item.id, tab);
                }}
              >
                <span className="text-muted-foreground">{t(item.label)} ›</span>
                {t(TAB_LABELS[tab])}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
