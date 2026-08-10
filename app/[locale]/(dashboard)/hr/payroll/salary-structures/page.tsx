"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getEmployees } from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    PageListLayout,
    PageListHeader,
    PageListTitle,
    PageListContent,
    PageListFilter,
} from "@/components/layout/page/list-layout";
import { Settings, Search, Loader2, History } from "lucide-react";
import { Protect } from "@/components/ui/protect";
import { CustomInput } from "@/components/ui/custom-input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { SalaryStructureHistory } from "./[contactId]/_components/salary-structure-history";

import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";

import { Contact, SalaryStructure } from "@/prisma/generated/prisma/client";

export default function SalaryStructuresPage() {
    const [search, setSearch] = useState("");
    const [historyContactId, setHistoryContactId] = useState<string | null>(null);

    const { data: employeesResult, isLoading } = useQuery({
        queryKey: ["employees", search],
        queryFn: async () => {
            const result = await getEmployees(search.toLowerCase());
            if (result.success && result.data) {
                return SuperJSON.deserialize<(Contact & { salaryStructures: SalaryStructure[] })[]>(result.data as SuperJSONResult);
            }
            return [];
        },
    });

    const employees = employeesResult;

    return (
        <PageListLayout>
            <PageListHeader>
                <PageListTitle title="Salary Structures" />
            </PageListHeader>

            <PageListFilter>
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <CustomInput
                        placeholder="Search employees..."
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
                                <TableHead>Employee</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Structure</TableHead>
                                <TableHead></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {employees?.map((employee: any) => {
                                const hasStructure = employee.salaryStructures?.length > 0;
                                return (
                                    <TableRow key={employee.id}>
                                        <TableCell className="font-medium">{employee.name}</TableCell>
                                        <TableCell>{employee.email || "-"}</TableCell>
                                        <TableCell>
                                            <Badge variant={employee.isActive ? "default" : "secondary"}>
                                                {employee.isActive ? "Active" : "Inactive"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {hasStructure ? (
                                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                                                    Configured
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800">
                                                    Not Configured
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Protect permission="payroll.configure">
                                                    <Link href={`/hr/payroll/salary-structures/${employee.id}`}>
                                                        <Button variant="ghost" size="sm">
                                                            <Settings className="mr-2 h-4 w-4" />
                                                            Configure
                                                        </Button>
                                                    </Link>
                                                </Protect>
                                                <Protect permission="payroll.view">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setHistoryContactId(employee.id)}
                                                    >
                                                        <History className="mr-2 h-4 w-4" />
                                                        History
                                                    </Button>
                                                </Protect>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {employees?.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8">
                                        {search ? "No employees match your search." : "No employees found. Add employees in the Contacts module first."}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                )}
            </PageListContent>

            <Dialog open={!!historyContactId} onOpenChange={(open) => !open && setHistoryContactId(null)}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Salary History</DialogTitle>
                    </DialogHeader>
                    {historyContactId && (
                        <SalaryStructureHistory contactId={historyContactId} />
                    )}
                </DialogContent>
            </Dialog>
        </PageListLayout >
    );
}
