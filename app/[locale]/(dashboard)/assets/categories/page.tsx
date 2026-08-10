"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Loader2, ArrowLeft, Search } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getAssetCategories } from "../actions";
import { SuperJSON } from "@/services/lib/superjson";
import { AssetCategory, Account } from "@/prisma/generated/prisma/browser";
import {
  PageListActions,
  PageListContent,
  PageListFilter,
  PageListHeader,
  PageListLayout,
  PageListTitle,
} from "@/components/layout/page/list-layout";
import { CustomInput } from "@/components/ui/custom-input";

type CategoryWithAccounts = AssetCategory & {
  assetAccount: Account;
  accumDepreciationAccount: Account;
  depreciationExpenseAccount: Account;
};

import { useTranslations } from "next-intl";

export default function AssetCategoriesPage() {
  const t = useTranslations("Assets");
  const tCommon = useTranslations("Common");
  const [search, setSearch] = useState("");

  const { data: categories, isLoading } = useQuery({
    queryKey: ["asset-categories"],
    queryFn: async () => {
      const serialized = await getAssetCategories();
      return SuperJSON.deserialize<CategoryWithAccounts[]>(serialized);
    },
  });

  const filteredCategories = categories?.filter((cat) =>
    cat.name.toLowerCase().includes(search.toLowerCase()) ||
    cat.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PageListLayout>
      <PageListHeader>
        <div className="flex items-center gap-4">
          <PageListTitle title={t("asset_categories")} />
        </div>
        <PageListActions>
          <Link href="/assets/categories/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t("new_category")}
            </Button>
          </Link>
        </PageListActions>
      </PageListHeader>

      <PageListFilter>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <CustomInput
            placeholder={t("search_categories")}
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
                <TableHead>{t("asset_account")}</TableHead>
                <TableHead>{t("accum_dep_account")}</TableHead>
                <TableHead>{t("dep_expense_account")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCategories?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    {t("no_categories_found")}
                  </TableCell>
                </TableRow>
              )}
              {filteredCategories?.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">{cat.code}</TableCell>
                  <TableCell>{cat.name}</TableCell>
                  <TableCell>{cat.assetAccount.name} ({cat.assetAccount.code})</TableCell>
                  <TableCell>{cat.accumDepreciationAccount.name} ({cat.accumDepreciationAccount.code})</TableCell>
                  <TableCell>{cat.depreciationExpenseAccount.name} ({cat.depreciationExpenseAccount.code})</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PageListContent>
    </PageListLayout>
  );
}
