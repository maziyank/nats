"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import {
  PageFormLayout,
  PageFormHeader,
  PageFormTitle,
  PageFormActions,
  PageFormContent,
} from "@/components/layout/page/form-layout";
import { Save, ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/services/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/services/lib/utils";
import { BeginningBalanceItem, getBeginningBalances, BeginningBalanceInput, saveBeginningBalances } from "../actions";

import { useTranslations } from "next-intl";

export function BeginningBalanceForm() {
  const t = useTranslations("Accounting");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // State for form data
  const [items, setItems] = useState<BeginningBalanceItem[]>([]);
  const [totals, setTotals] = useState({ debit: 0, credit: 0 });

  // Fetch data
  const { data: response, isLoading, isError } = useQuery({
    queryKey: ["beginning-balances"],
    queryFn: async () => {
      const res = await getBeginningBalances();
      if (!res.success) {
        throw new Error(res.error || "Failed to fetch balances");
      }
      if (!res.data) {
        throw new Error("Failed to fetch balances");
      }
      return res.data;
    },
  });

  // Initialize state when data loads
  useEffect(() => {
    if (response) {
      // Map response to items
      const initializedItems = response.map(item => {
        return {
          ...item,
          currentDebit: 0,
          currentCredit: 0,
        };
      });
      setItems(initializedItems);
    }
  }, [response]);

  // Recalculate totals whenever items change
  useEffect(() => {
    const newTotals = items.reduce(
      (acc, item) => ({
        debit: acc.debit + (item.currentDebit || 0),
        credit: acc.credit + (item.currentCredit || 0),
      }),
      { debit: 0, credit: 0 }
    );
    setTotals(newTotals);
  }, [items]);

  const updateItem = (index: number, field: "currentDebit" | "currentCredit", value: number) => {
    const newItems = [...items];
    const item = newItems[index];

    if (field === "currentDebit") {
      item.currentDebit = value;
      if (value > 0) item.currentCredit = 0;
    } else {
      item.currentCredit = value;
      if (value > 0) item.currentDebit = 0;
    }

    item.netBalance = item.currentDebit - item.currentCredit;
    setItems(newItems);
  };

  const isBalanced = Math.abs(totals.debit - totals.credit) < 0.01;

  const handleSubmit = async () => {
    if (!isBalanced) {
      toast({
        title: t("validation_error"),
        description: t("debit_credit_equal"),
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      // Prepare inputs
      const inputs: BeginningBalanceInput[] = items.map(item => ({
        accountId: item.accountId,
        debit: item.currentDebit,
        credit: item.currentCredit,
      }));

      const res = await saveBeginningBalances(inputs);

      if (res.success) {
        toast({
          title: tCommon("success"),
          description: t("opening_balances_updated")
        });
      } else {
        toast({
          title: tCommon("error"),
          description: res.error || "Failed to save changes",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error(error);
      toast({
        title: tCommon("error"),
        description: "Something went wrong",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-[400px] items-center justify-center text-destructive">
        {t("failed_load_accounts")}
      </div>
    );
  }

  return (
    <PageFormLayout>
      <PageFormHeader>
        <PageFormTitle>{t("opening_balances")}</PageFormTitle>
        <PageFormActions>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={saving}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {tCommon("back")}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !isBalanced}
            variant={isBalanced ? "default" : "secondary"}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t("save_changes")}
          </Button>
        </PageFormActions>
      </PageFormHeader>

      <PageFormContent>
        <div className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-md border text-sm text-muted-foreground">
            <p>
              {t("enter_beginning_balance")}
            </p>
          </div>

          {!isBalanced && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t("unbalanced")}</AlertTitle>
              <AlertDescription>
                {tCommon("total")} {tCommon("debit")} ({formatCurrency(totals.debit)}) {t("does_not_match")} {tCommon("total")} {tCommon("credit")} ({formatCurrency(totals.credit)}).
                {t("difference_val")}: {formatCurrency(Math.abs(totals.debit - totals.credit))}.
              </AlertDescription>
            </Alert>
          )}

          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">{tCommon("code")}</TableHead>
                  <TableHead className="min-w-[200px]">{t("account_name")}</TableHead>
                  <TableHead className="w-[150px] text-right">{t("system_balance")}</TableHead>
                  <TableHead className="w-[150px] text-right">{t("target_debit")}</TableHead>
                  <TableHead className="w-[150px] text-right">{t("target_credit")}</TableHead>
                  <TableHead className="w-[150px] text-right">{t("adjustment")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {t("no_posting_accounts")}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item, index) => {
                    const adjustment = item.currentDebit - item.currentCredit - item.netBalance;
                    return (
                      <TableRow key={item.accountId}>
                        <TableCell className="font-medium">{item.accountCode}</TableCell>
                        <TableCell className="text-sm">{item.accountName}</TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">
                          {formatCurrency(item.netBalance)}
                        </TableCell>
                        <TableCell className="p-1">
                          <CurrencyInput
                            value={item.currentDebit}
                            onChange={(val) => updateItem(index, "currentDebit", val)}
                            className="w-full border-0 shadow-none text-right focus-visible:ring-1 focus-visible:ring-inset"
                            placeholder="0.00"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <CurrencyInput
                            value={item.currentCredit}
                            onChange={(val) => updateItem(index, "currentCredit", val)}
                            className="w-full border-0 shadow-none text-right focus-visible:ring-1 focus-visible:ring-inset"
                            placeholder="0.00"
                          />
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-medium text-sm",
                          adjustment > 0 ? "text-green-600" : adjustment < 0 ? "text-red-600" : "text-muted-foreground"
                        )}>
                          {adjustment !== 0 ? (adjustment > 0 ? "+" : "") + formatCurrency(adjustment) : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="font-bold">{tCommon("total")}</TableCell>
                  <TableCell className={cn("text-right font-bold", !isBalanced && "text-destructive")}>{formatCurrency(totals.debit)}</TableCell>
                  <TableCell className={cn("text-right font-bold", !isBalanced && "text-destructive")}>{formatCurrency(totals.credit)}</TableCell>
                  <TableCell className="text-right font-bold">
                    {formatCurrency(items.reduce((sum, item) => sum + (item.currentDebit - item.currentCredit - item.netBalance), 0))}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </div>
      </PageFormContent>
    </PageFormLayout>
  );
}
