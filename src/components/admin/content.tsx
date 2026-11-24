import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ADMIN_SECTION_TABS,
  TAB_LABELS,
  type AdminTab,
} from "@/lib/admin-sections";
import type { Catalog } from "@/lib/catalog";
import { AffiliatesTab } from "./content-affiliates";
import { CategoriesTab } from "./content-categories";
import { ProductsTab } from "./content-products";
import { MediaLibrary } from "./media";
import { PageHeader, useAdminCopy } from "./ui";

export function ContentSection({
  catalog,
  tab,
  onTab,
}: {
  catalog: Catalog;
  tab: AdminTab | undefined;
  onTab: (tab: AdminTab) => void;
}) {
  const { t, dir } = useAdminCopy();
  const current = tab ?? "products";
  return (
    <div>
      <PageHeader title={t("navContent")} description={t("navContentDesc")} />
      <Tabs
        value={current}
        onValueChange={(v) => onTab(v as AdminTab)}
        dir={dir}
      >
        <TabsList>
          {ADMIN_SECTION_TABS.content.map((id) => (
            <TabsTrigger key={id} value={id}>
              {t(TAB_LABELS[id])}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="products">
          <ProductsTab catalog={catalog} />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesTab catalog={catalog} />
        </TabsContent>
        <TabsContent value="affiliates">
          <AffiliatesTab />
        </TabsContent>
        <TabsContent value="media">
          <MediaLibrary />
        </TabsContent>
      </Tabs>
    </div>
  );
}
