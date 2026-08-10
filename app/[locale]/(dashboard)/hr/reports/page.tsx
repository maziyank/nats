"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
    PageListLayout,
    PageListHeader,
    PageListTitle,
    PageListContent,
} from "@/components/layout/page/list-layout";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { getHrDashboardStats } from "../employees/actions";
import { getPayrollCostByDepartment } from "../payroll/actions";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { useReportExport } from "@/hooks/use-report-export";
import { ReportExportButton } from "@/components/ui/report-export-button";
import type { ExportColumn } from "@/services/lib/export";

type DashboardStats = {
    totalEmployees: number;
    activeEmployees: number;
    inactiveEmployees: number;
    pendingLeaves: number;
    openPeriods: number;
    byDepartment: { department: string; count: number }[];
};

type CostByDept = {
    department: string;
    headcount: number;
    gross: number;
    net: number;
    deductions: number;
};

export default function HrReportsPage() {
    const t = useTranslations("HR");

    const { data: stats, isLoading: statsLoading } = useQuery({
        queryKey: ["hr-dashboard-stats"],
        queryFn: async () => {
            const result = await getHrDashboardStats();
            if (!result.success) throw new Error(result.error);
            return SuperJSON.deserialize<DashboardStats>(
                result.data as SuperJSONResult
            );
        },
    });

    const { data: costs, isLoading: costsLoading } = useQuery({
        queryKey: ["payroll-cost-by-department"],
        queryFn: async () => {
            const result = await getPayrollCostByDepartment();
            if (!result.success) throw new Error(result.error);
            return SuperJSON.deserialize<CostByDept[]>(
                result.data as SuperJSONResult
            );
        },
    });

    const headcountColumns: ExportColumn<Record<string, unknown>>[] = [
        { key: "department", header: t("department") },
        { key: "count", header: t("headcount") },
    ];

    const costColumns: ExportColumn<Record<string, unknown>>[] = [
        { key: "department", header: t("department") },
        { key: "headcount", header: t("headcount") },
        { key: "gross", header: t("gross_salary") },
        { key: "net", header: t("net_salary") },
        { key: "deductions", header: t("total_deductions") },
    ];

    const headcountExport = useReportExport<Record<string, unknown>>({
        fetchRows: async () =>
            (stats?.byDepartment ?? []) as unknown as Array<
                Record<string, unknown>
            >,
        columns: headcountColumns,
        filename: "hr-headcount-by-department",
        sheetName: "Headcount",
        estimatedRowCount: stats?.byDepartment?.length,
    });

    const costExport = useReportExport<Record<string, unknown>>({
        fetchRows: async () =>
            (costs ?? []) as unknown as Array<Record<string, unknown>>,
        columns: costColumns,
        filename: "hr-payroll-cost-by-department",
        sheetName: "Payroll Cost",
        estimatedRowCount: costs?.length,
    });

    return (
        <PageListLayout>
            <PageListHeader>
                <div className="flex w-full items-center justify-between gap-4">
                    <PageListTitle title={t("reports")} />
                    <div className="flex items-center gap-2">
                        <ReportExportButton
                            onExportCsv={headcountExport.exportCsv}
                            onExportExcel={headcountExport.exportExcel}
                            isExporting={headcountExport.isExporting}
                            exportingFormat={headcountExport.exportingFormat}
                            disabled={
                                statsLoading || !stats?.byDepartment?.length
                            }
                        />
                        <ReportExportButton
                            onExportCsv={costExport.exportCsv}
                            onExportExcel={costExport.exportExcel}
                            isExporting={costExport.isExporting}
                            exportingFormat={costExport.exportingFormat}
                            disabled={costsLoading || !costs?.length}
                        />
                    </div>
                </div>
            </PageListHeader>

            <div className="grid gap-4 md:grid-cols-4">
                {statsLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-24 w-full" />
                    ))
                ) : (
                    <>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">
                                    {t("headcount")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {stats?.activeEmployees ?? 0}
                                </div>
                                <CardDescription>
                                    {stats?.totalEmployees ?? 0} {t("employees").toLowerCase()}
                                </CardDescription>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">
                                    {t("inactive")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {stats?.inactiveEmployees ?? 0}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">
                                    {t("pending_leaves")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {stats?.pendingLeaves ?? 0}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">
                                    {t("open_periods")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {stats?.openPeriods ?? 0}
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>

            <PageListContent>
                <div className="grid gap-6 lg:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t("headcount_by_department")}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {statsLoading ? (
                                <Skeleton className="h-40 w-full" />
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t("department")}</TableHead>
                                            <TableHead className="text-right">
                                                {t("headcount")}
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(stats?.byDepartment || []).map((row) => (
                                            <TableRow key={row.department}>
                                                <TableCell>{row.department}</TableCell>
                                                <TableCell className="text-right">
                                                    {row.count}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {!stats?.byDepartment?.length && (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={2}
                                                    className="text-center text-muted-foreground py-6"
                                                >
                                                    —
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>{t("cost_by_department")}</CardTitle>
                            <CardDescription>
                                {t("payroll")} · {t("gross_salary")} / {t("net_salary")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {costsLoading ? (
                                <Skeleton className="h-40 w-full" />
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t("department")}</TableHead>
                                            <TableHead className="text-right">
                                                {t("headcount")}
                                            </TableHead>
                                            <TableHead className="text-right">
                                                {t("gross_salary")}
                                            </TableHead>
                                            <TableHead className="text-right">
                                                {t("net_salary")}
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(costs || []).map((row) => (
                                            <TableRow key={row.department}>
                                                <TableCell>{row.department}</TableCell>
                                                <TableCell className="text-right">
                                                    {row.headcount}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {row.gross.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right font-medium">
                                                    {row.net.toLocaleString()}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {!costs?.length && (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={4}
                                                    className="text-center text-muted-foreground py-6"
                                                >
                                                    —
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </PageListContent>
        </PageListLayout>
    );
}
