"use client";

import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    runPayroll,
    approvePayrollRun,
    markSlipsPaid,
    getBankTransferExport,
} from "../../actions";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play, CheckCircle, Banknote, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { Protect } from "@/components/ui/protect";

type BankExportRow = {
    employeeName: string;
    employeeNumber: string;
    bankName: string;
    bankAccount: string;
    bankHolder: string;
    netSalary: number;
    slipId: string;
    status: string;
};

export function PayrollActions({
    periodId,
    status,
    userId,
}: {
    periodId: string;
    status: string;
    userId: string;
}) {
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
    const t = useTranslations("HR");
    const tCommon = useTranslations("Common");

    const handleRunPayroll = async () => {
        setLoading(true);
        try {
            const result = await runPayroll(periodId);
            if (result.success) {
                const data = result.data
                    ? SuperJSON.deserialize<{ totalSlips?: number }>(
                          result.data as SuperJSONResult
                      )
                    : null;
                if (data?.totalSlips === 0) {
                    toast({
                        title: t("missing_structure_warning"),
                        description: t("no_slips_generated"),
                        variant: "destructive",
                    });
                } else {
                    toast({
                        title: tCommon("success"),
                        description: `${t("run_payroll")}: ${data?.totalSlips ?? 0}`,
                    });
                }
                router.refresh();
            } else {
                toast({
                    title: tCommon("error"),
                    description: result.error,
                    variant: "destructive",
                });
            }
        } catch {
            toast({
                title: tCommon("error"),
                description: "Something went wrong",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleApproveRun = async () => {
        setLoading(true);
        try {
            const result = await approvePayrollRun(periodId, userId);
            if (result.success) {
                toast({
                    title: tCommon("success"),
                    description: t("approved"),
                });
                router.refresh();
            } else {
                toast({
                    title: tCommon("error"),
                    description: result.error,
                    variant: "destructive",
                });
            }
        } catch {
            toast({
                title: tCommon("error"),
                description: "Something went wrong",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleMarkAllPaid = async () => {
        setLoading(true);
        try {
            const result = await markSlipsPaid(periodId);
            if (result.success) {
                toast({
                    title: tCommon("success"),
                    description: t("mark_paid"),
                });
                router.refresh();
            } else {
                toast({
                    title: tCommon("error"),
                    description: result.error,
                    variant: "destructive",
                });
            }
        } catch {
            toast({
                title: tCommon("error"),
                description: "Something went wrong",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleExportBankCsv = async () => {
        setLoading(true);
        try {
            const result = await getBankTransferExport(periodId);
            if (!result.success) {
                toast({
                    title: tCommon("error"),
                    description: result.error || "Export failed",
                    variant: "destructive",
                });
                return;
            }
            if (!result.data) {
                toast({
                    title: tCommon("error"),
                    description: "Export failed",
                    variant: "destructive",
                });
                return;
            }
            const rows = SuperJSON.deserialize<BankExportRow[]>(
                result.data as SuperJSONResult
            );
            const headers = [
                "employeeName",
                "employeeNumber",
                "bankName",
                "bankAccount",
                "bankHolder",
                "netSalary",
                "status",
            ];
            const escape = (v: string | number) => {
                const s = String(v ?? "");
                if (s.includes(",") || s.includes('"') || s.includes("\n")) {
                    return `"${s.replace(/"/g, '""')}"`;
                }
                return s;
            };
            const csvLines = [
                headers.join(","),
                ...rows.map((r) =>
                    [
                        r.employeeName,
                        r.employeeNumber,
                        r.bankName,
                        r.bankAccount,
                        r.bankHolder,
                        r.netSalary,
                        r.status,
                    ]
                        .map(escape)
                        .join(",")
                ),
            ];
            const blob = new Blob([csvLines.join("\n")], {
                type: "text/csv;charset=utf-8;",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `bank-transfer-${periodId}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            toast({
                title: tCommon("success"),
                description: t("export_bank"),
            });
        } catch {
            toast({
                title: tCommon("error"),
                description: "Something went wrong",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    if (status === "COMPLETED") {
        return (
            <div className="flex gap-2">
                <Button disabled variant="outline">
                    <CheckCircle className="mr-2 h-4 w-4" />
                    {t("approved")}
                </Button>
                <Protect permission="payroll.pay">
                    <Button onClick={handleMarkAllPaid} disabled={loading} variant="default">
                        {loading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Banknote className="mr-2 h-4 w-4" />
                        )}
                        {t("mark_paid")}
                    </Button>
                    <Button
                        onClick={handleExportBankCsv}
                        disabled={loading}
                        variant="outline"
                    >
                        {loading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Download className="mr-2 h-4 w-4" />
                        )}
                        {t("export_bank")}
                    </Button>
                </Protect>
            </div>
        );
    }

    return (
        <div className="flex gap-2">
            <Protect permission="payroll.create">
                <Button onClick={handleRunPayroll} disabled={loading} variant="default">
                    {loading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Play className="mr-2 h-4 w-4" />
                    )}
                    {status === "PROCESSING" ? t("re_run_payroll") : t("run_payroll")}
                </Button>
            </Protect>
            {status === "PROCESSING" && (
                <Protect permission="payroll.approve">
                    <Button
                        onClick={handleApproveRun}
                        disabled={loading}
                        variant="default"
                        className="bg-green-600 hover:bg-green-700"
                    >
                        {loading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <CheckCircle className="mr-2 h-4 w-4" />
                        )}
                        {t("approve")}
                    </Button>
                </Protect>
            )}
        </div>
    );
}
