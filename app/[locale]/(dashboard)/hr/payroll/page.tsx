import { getPayrollPeriods } from "./actions";
import { format } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PayrollPageActions } from "./_components/payroll-page-actions";
import {
    PageListLayout,
    PageListHeader,
    PageListTitle,
    PageListActions,
    PageListContent,
} from "@/components/layout/page/list-layout";

import { SuperJSON } from "@/services/lib/superjson";
import { PayrollPeriod, PayrollPeriodStatus } from "@/prisma/generated/prisma/client";
import { getTranslations } from "next-intl/server";

type PayrollPeriodsResult = {
    items: (PayrollPeriod & {
        payrollRuns: any[];
    })[];
    total: number;
    totalPages: number;
};

export default async function PayrollPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string }>;
}) {
    const t = await getTranslations("HR");
    const tCommon = await getTranslations("Common");
    const resolvedParams = await searchParams;
    const page = Number(resolvedParams.page) || 1;
    const response = await getPayrollPeriods(page);
    const periodsData =
        response.success && response.data
            ? SuperJSON.deserialize<PayrollPeriodsResult>(response.data)
            : null;

    return (
        <PageListLayout>
            <PageListHeader>
                <PageListTitle title={t("payroll")} />
                <PageListActions>
                    <PayrollPageActions />
                </PageListActions>
            </PageListHeader>

            <PageListContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("start_date")}</TableHead>
                            <TableHead>{t("end_date")}</TableHead>
                            <TableHead>{t("name")}</TableHead>
                            <TableHead>{tCommon("status")}</TableHead>
                            <TableHead></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {periodsData?.items.map((period) => (
                            <TableRow key={period.id}>
                                <TableCell>{format(new Date(period.startDate), "PP")}</TableCell>
                                <TableCell>{format(new Date(period.endDate), "PP")}</TableCell>
                                <TableCell>{period.name}</TableCell>
                                <TableCell>
                                    <Badge variant={period.status === "COMPLETED" ? "default" : "secondary"}>
                                        {period.status}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <Link href={`/hr/payroll/${period.id}`}>
                                        <Button variant="ghost" size="sm">
                                            {tCommon("view")}
                                        </Button>
                                    </Link>
                                </TableCell>
                            </TableRow>
                        ))}
                        {!periodsData?.items.length && (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-8">
                                    {t("no_periods_found")}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </PageListContent>
        </PageListLayout>
    );
}
