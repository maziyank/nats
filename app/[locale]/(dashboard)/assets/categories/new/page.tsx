"use client";
export const dynamic = "force-dynamic";

import { useQuery } from "@tanstack/react-query";
import { getAccounts } from "../../../accounting/accounts/actions";
import { SuperJSON } from "@/services/lib/superjson";
import { Account } from "@/prisma/generated/prisma/browser";
import { CategoryForm } from "../_components/category-form";
import { Loader2 } from "lucide-react";

export default function NewAssetCategoryPage() {
  const { data: accounts, isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const result = await getAccounts();
      // Result can be Account[] or { data: Account[], ... } depending on pagination
      // Based on getAccounts implementation in actions.ts:
      // if no page provided, it returns Account[]
      return SuperJSON.deserialize<Account[]>(result as any);
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <CategoryForm accounts={accounts || []} />
  );
}
