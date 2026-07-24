"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Zap } from "lucide-react";
import { seedDefaultAccounts, saveCustomDefaultAccounts } from "../actions";
import { useToast } from "@/hooks/use-toast";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DefaultAccountPurpose } from "@/prisma/generated/prisma/browser";

const PURPOSE_LABELS: Record<DefaultAccountPurpose, string> = {
    ACCOUNTS_RECEIVABLE: "Accounts Receivable",
    ACCOUNTS_PAYABLE: "Accounts Payable",
    GOODS_RECEIVED_NOT_INVOICED: "Goods Received Not Invoiced",
    INVENTORY_ASSET: "Inventory Asset",
    COGS: "Cost of Goods Sold",
    SALES_REVENUE: "Sales Revenue",
    SALES_DISCOUNT: "Sales Discount",
    SALES_TAX_PAYABLE: "Sales Tax Payable",
    PURCHASE_TAX_RECEIVABLE: "Purchase Tax Receivable",
    CASH_ON_HAND: "Cash on Hand",
    BANK: "Bank",
    OPENING_BALANCE_EQUITY: "Opening Balance Equity",
    RETAINED_EARNINGS: "Retained Earnings",
    UNCATEGORIZED_EXPENSE: "Uncategorized Expense",
    UNCATEGORIZED_INCOME: "Uncategorized Income",
    UNCATEGORIZED_ASSET: "Uncategorized Asset",
    EXCHANGE_GAIN_LOSS: "Exchange Gain/Loss",
    SALARIES_EXPENSE: "Salaries Expense",
    PAYROLL_LIABILITY: "Payroll Liability",
    PAYROLL_TAX_PAYABLE: "Payroll Tax Payable",
    BPJS_PAYABLE: "BPJS Payable",
    WIP_INVENTORY: "Work-in-Progress Inventory",
    PRODUCTION_OVERHEAD: "Production Overhead",
};

const PURPOSE_GROUPS: Record<string, DefaultAccountPurpose[]> = {
    "Sales & Receivables": [
        "SALES_REVENUE",
        "SALES_DISCOUNT",
        "ACCOUNTS_RECEIVABLE",
        "SALES_TAX_PAYABLE",
    ],
    "Purchases & Payables": [
        "ACCOUNTS_PAYABLE",
        "PURCHASE_TAX_RECEIVABLE",
        "GOODS_RECEIVED_NOT_INVOICED",
        "COGS",
        "INVENTORY_ASSET",
    ],
    "Cash & Bank": ["CASH_ON_HAND", "BANK"],
    "Equity & Others": [
        "OPENING_BALANCE_EQUITY",
        "RETAINED_EARNINGS",
        "UNCATEGORIZED_ASSET",
        "UNCATEGORIZED_EXPENSE",
        "UNCATEGORIZED_INCOME",
        "EXCHANGE_GAIN_LOSS",
    ],
    "Payroll": ["SALARIES_EXPENSE", "PAYROLL_LIABILITY", "PAYROLL_TAX_PAYABLE", "BPJS_PAYABLE"],
    "Production": ["WIP_INVENTORY", "PRODUCTION_OVERHEAD"],
};

type AccountOption = {
    id: string;
    code: string;
    name: string;
    type: string;
};

type ExistingDefault = {
    purpose: DefaultAccountPurpose;
    accountId: string;
};

interface StepDefaultAccountsProps {
    onComplete: () => void;
    accounts: AccountOption[];
    existingDefaults: ExistingDefault[];
    existingDefaultCount: number;
}

export function StepDefaultAccounts({
    onComplete,
    accounts,
    existingDefaults,
    existingDefaultCount,
}: StepDefaultAccountsProps) {
    const [isPending, startTransition] = useTransition();
    const [isAutoMapped, setIsAutoMapped] = useState(existingDefaultCount > 0);
    const [mappings, setMappings] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {};
        for (const def of existingDefaults) {
            initial[def.purpose] = def.accountId;
        }
        return initial;
    });
    const { toast } = useToast();

    const accountOptions = accounts.map((a) => ({
        value: a.id,
        label: `${a.code} - ${a.name}`,
    }));

    const handleAutoMap = () => {
        startTransition(async () => {
            const result = await seedDefaultAccounts();
            if (result.success) {
                setIsAutoMapped(true);
                toast({
                    title: "Default accounts mapped",
                    description: `${result.data?.mappedCount ?? 0} accounts were auto-mapped.`,
                });
                onComplete();
            } else {
                toast({
                    title: "Error",
                    description: result.error || "Failed to map default accounts",
                    variant: "destructive",
                });
            }
        });
    };

    const handleSaveCustom = () => {
        const entries = Object.entries(mappings)
            .filter(([, accountId]) => accountId)
            .map(([purpose, accountId]) => ({
                purpose: purpose as DefaultAccountPurpose,
                accountId,
            }));

        startTransition(async () => {
            const result = await saveCustomDefaultAccounts(entries);
            if (result.success) {
                toast({
                    title: "Default accounts saved",
                    description: "Your custom default account mappings have been saved.",
                });
                onComplete();
            } else {
                toast({
                    title: "Error",
                    description: result.error || "Failed to save default accounts",
                    variant: "destructive",
                });
            }
        });
    };

    const handleChange = (purpose: string, accountId: string | null) => {
        if (!accountId) return;
        setMappings((prev) => ({ ...prev, [purpose]: accountId }));
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-semibold">Default Accounts</h2>
                <p className="text-muted-foreground mt-1">
                    Map default GL accounts for each transaction type. These are used automatically
                    when creating invoices, payments, and other transactions.
                </p>
            </div>

            {isAutoMapped ? (
                <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <div>
                        <p className="font-medium text-green-700 dark:text-green-300">
                            Default accounts are configured
                        </p>
                        <p className="text-sm text-green-600 dark:text-green-400">
                            You can adjust these later in Accounting → Configuration → Default Accounts.
                        </p>
                    </div>
                </div>
            ) : (
                <>
                    <Button onClick={handleAutoMap} disabled={isPending} variant="outline" className="w-full">
                        <Zap className="mr-2 h-4 w-4" />
                        {isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Auto-map Recommended Defaults
                    </Button>

                    <div className="relative rounded-lg border">
                        <div className="divide-y">
                            {Object.entries(PURPOSE_GROUPS).map(([group, purposes]) => (
                                <div key={group}>
                                    <div className="bg-muted px-4 py-2">
                                        <span className="text-sm font-semibold">{group}</span>
                                    </div>
                                    <div className="divide-y">
                                        {purposes.map((purpose) => (
                                            <div
                                                key={purpose}
                                                className="flex items-center gap-4 px-4 py-3"
                                            >
                                                <span className="min-w-48 text-sm font-medium">
                                                    {PURPOSE_LABELS[purpose]}
                                                </span>
                                                <div className="flex-1">
                                                    <SearchableSelect
                                                        options={accountOptions}
                                                        value={mappings[purpose] || null}
                                                        onValueChange={(val) => handleChange(purpose, val)}
                                                        placeholder="Select account..."
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}

            <div className="flex justify-end gap-2">
                {!isAutoMapped && (
                    <Button onClick={handleSaveCustom} disabled={isPending}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save & Continue
                    </Button>
                )}
                {isAutoMapped && (
                    <Button onClick={onComplete}>Continue</Button>
                )}
            </div>
        </div>
    );
}
