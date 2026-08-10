"use client";
export const dynamic = "force-dynamic";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Loader2 } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getAssets } from "./actions";
import { SuperJSON } from "@/services/lib/superjson";
import { Asset, AssetCategory } from "@/prisma/generated/prisma/browser";
import { useState } from "react";
import { useFormatCurrency, useFormatDate } from "@/hooks";
import { Badge } from "@/components/ui/badge";
import {
  PageListActions,
  PageListContent,
  PageListFilter,
  PageListHeader,
  PageListLayout,
  PageListTitle,
} from "@/components/layout/page/list-layout";
import { CustomInput } from "@/components/ui/custom-input";

type AssetWithCategory = Asset & {
  category: AssetCategory;
};

import { useTranslations } from "next-intl";

export default function AssetsPage() {
  const t = useTranslations("Assets");
  const tCommon = useTranslations("Common");
  const [search, setSearch] = useState("");
  const formatCurrency = useFormatCurrency();
  const formatDate = useFormatDate();

  const { data: assets, isLoading } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      const serialized = await getAssets();
      return SuperJSON.deserialize<AssetWithCategory[]>(serialized);
    },
  });

  const filteredAssets = assets?.filter((asset) =>
    asset.name.toLowerCase().includes(search.toLowerCase()) ||
    asset.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PageListLayout>
      <PageListHeader>
        <PageListTitle title={t("fixed_assets")} />
        <PageListActions>
          <div className="flex gap-2">
            <Link href="/assets/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                {t("new_asset")}
              </Button>
            </Link>
          </div>
        </PageListActions>
      </PageListHeader>

      <PageListFilter>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <CustomInput
            placeholder={t("search_assets")}
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </PageListFilter>

      <PageListContent>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("code")}</TableHead>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("category")}</TableHead>
                <TableHead>{tCommon("status")}</TableHead>
                <TableHead>{t("purchase_date")}</TableHead>
                <TableHead className="text-right">{t("acquisition_cost")}</TableHead>
                <TableHead className="text-right">{t("book_value")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAssets?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    {t("no_assets_found")}
                  </TableCell>
                </TableRow>
              )}
              {filteredAssets?.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="font-medium">{asset.code}</TableCell>
                  <TableCell>
                    <Link href={`/assets/${asset.id}`} className="hover:underline">
                      {asset.name}
                    </Link>
                  </TableCell>
                  <TableCell>{asset.category.name}</TableCell>
                  <TableCell>
                    <Badge variant={asset.status === "ACTIVE" ? "default" : "secondary"}>
                      {asset.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(asset.purchaseDate)}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(Number(asset.acquisitionCost))}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(Number(asset.currentBookValue))}
                  </TableCell>
                  <TableCell>
                    <Link href={`/assets/${asset.id}`}>
                      <Button variant="ghost" size="sm">{tCommon("view")}</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PageListContent>
    </PageListLayout>
  );
}
