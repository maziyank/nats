import { getPayrollPeriod, getPayrollReadiness } from "../actions";
import { verifySession } from "@/services/lib/auth/auth";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Printer, FileText, AlertTriangle } from "lucide-react";
import { PayrollActions } from "./_components/payroll-actions";
import {
    PageListLayout,
    PageListHeader,
    PageListTitle,
    PageListActions,
    PageListContent,
} from "@/components/layout/page/list-layout";

const STATUS_BADGE_VARIANTS: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
    PROCESSING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
    COMPLETED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    CANCELLED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

const SLIP_STATUS_VARIANTS: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    PUBLISHED: "bg-blue-100 text-blue-800",
    PAID: "bg-green-100 text-green-800",
    CANCELLED: "bg-red-100 text-red-700",
};

import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { PayrollPeriod, PayrollRun, SalarySlip, Contact } from "@/prisma/generated/prisma/client";

type PeriodWithDetails = PayrollPeriod & {
    payrollRuns: PayrollRun[];
    salarySlips: (SalarySlip & { contact: Contact })[];
};

import { getTranslations } from "next-intl/server";

export default async function PeriodDetailPage({
    params,
}: {
    params: Promise<{ periodId: string }>;
}) {
    const { periodId } = await params;
    const t = await getTranslations("HR");
    const tCommon = await getTranslations("Common");
    const { userId } = await verifySession();
    const [response, readinessResponse] = await Promise.all([
        getPayrollPeriod(periodId),
        getPayrollReadiness(),
    ]);
    const period =
        response.success && response.data
            ? SuperJSON.deserialize<PeriodWithDetails>(response.data)
            : null;

    if (!period) {
        notFound();
    }

    const readiness =
        readinessResponse.success && readinessResponse.data
            ? SuperJSON.deserialize<{
                  totalActive: number;
                  readyCount: number;
                  missingStructure: { id: string; name: string }[];
              }>(readinessResponse.data as SuperJSONResult)
            : null;

    let totalEarnings = 0;
    let totalDeductions = 0;
    let netPay = 0;

    const latestRun = period.payrollRuns.length > 0
        ? period.payrollRuns[period.payrollRuns.length - 1]
        : null;

    if (period.status === "COMPLETED" && latestRun) {
        totalEarnings = Number(latestRun.totalEarnings);
        totalDeductions = Number(latestRun.totalDeductions);
        netPay = Number(latestRun.netPay);
    } else {
        period.salarySlips.forEach((slip) => {
            totalEarnings += Number(slip.grossSalary);
            totalDeductions += Number(slip.totalDeductions);
            netPay += Number(slip.netSalary);
        });
    }

    return (
        <PageListLayout>
            <PageListHeader>
                <div className="flex items-center gap-4">
                    <PageListTitle title={period.name} />
                    <p className="text-muted-foreground text-sm">
                        {format(new Date(period.startDate), "PP")} –{" "}
                        {format(new Date(period.endDate), "PP")}
                    </p>

                </div>
                <PageListActions>
                    <div className="flex items-center gap-2">
                        <Badge
                            variant="outline"
                            className={`border-transparent ${STATUS_BADGE_VARIANTS[period.status] ?? ""}`}
                        >
                            {period.status}
                        </Badge>
                        <PayrollActions periodId={period.id} status={period.status} userId={userId} />
                    </div>
                </PageListActions>
            </PageListHeader>

            {period.status !== "COMPLETED" &&
                readiness &&
                readiness.missingStructure.length > 0 && (
                    <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                        <CardContent className="flex items-start gap-3 py-4">
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                            <div className="space-y-1 text-sm">
                                <p className="font-medium text-amber-900 dark:text-amber-200">
                                    {t("missing_structure_warning")}
                                </p>
                                <p className="text-amber-800 dark:text-amber-300">
                                    {readiness.readyCount}/{readiness.totalActive} ready. Missing:{" "}
                                    {readiness.missingStructure
                                        .slice(0, 5)
                                        .map((e) => e.name)
                                        .join(", ")}
                                    {readiness.missingStructure.length > 5
                                        ? ` +${readiness.missingStructure.length - 5}`
                                        : ""}
                                </p>
                                <Link
                                    href="/hr/payroll/salary-structures"
                                    className="text-amber-900 underline dark:text-amber-100"
                                >
                                    {t("salary_structures")}
                                </Link>
                            </div>
                        </CardContent>
                    </Card>
                )}

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{t("total_earnings")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalEarnings.toLocaleString()}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{t("total_deductions")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{totalDeductions.toLocaleString()}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{t("net_pay")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">{netPay.toLocaleString()}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Journal Entry Link */}
            {latestRun?.journalEntryId && (
                <Card>
                    <CardContent className="flex items-center gap-3 py-4">
                        <FileText className="h-5 w-5 text-blue-600" />
                        <span className="text-sm font-medium">{t("journal_entry_created")}:</span>
                        <Link href={`/accounting/journal-entries/${latestRun.journalEntryId}`}>
                            <Button variant="link" size="sm" className="px-0">
                                {t("view_journal_entry")} →
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            )}

            <PageListContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("employee")}</TableHead>
                            <TableHead className="text-right">{t("gross_salary")}</TableHead>
                            <TableHead className="text-right">{t("total_deductions")}</TableHead>
                            <TableHead className="text-right">{t("net_salary")}</TableHead>
                            <TableHead>{tCommon("status")}</TableHead>
                            <TableHead></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {period.salarySlips.map((slip) => (
                            <TableRow key={slip.id}>
                                <TableCell className="font-medium">{slip.contact.name}</TableCell>
                                <TableCell className="text-right">
                                    {Number(slip.grossSalary).toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right text-red-600">
                                    {Number(slip.totalDeductions).toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right font-semibold">
                                    {Number(slip.netSalary).toLocaleString()}
                                </TableCell>
                                <TableCell>
                                    <Badge
                                        variant="outline"
                                        className={`border-transparent ${SLIP_STATUS_VARIANTS[slip.status] ?? ""}`}
                                    >
                                        {slip.status}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <Link href={`/hr/payroll/slips/${slip.id}/print`}>
                                        <Button variant="ghost" size="sm">
                                            <Printer className="mr-2 h-4 w-4" />
                                            {t("print_slip")}
                                        </Button>
                                    </Link>
                                </TableCell>
                            </TableRow>
                        ))}
                        {!period.salarySlips.length && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                    {t("no_slips_generated")}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </PageListContent>
        </PageListLayout>
    );
}
