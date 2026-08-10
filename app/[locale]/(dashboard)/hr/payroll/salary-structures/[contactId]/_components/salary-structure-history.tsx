"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { getSalaryHistory } from "@/app/[locale]/(dashboard)/hr/payroll/actions";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { Loader2, Eye } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SalaryStructure, SalaryStructureItem, SalaryComponent } from "@/prisma/generated/prisma/client";

interface SalaryStructureHistoryProps {
    contactId: string;
}

type HistoryItem = SalaryStructure & {
    items: (SalaryStructureItem & { component: SalaryComponent })[];
};

export function SalaryStructureHistory({ contactId }: SalaryStructureHistoryProps) {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchHistory() {
            setLoading(true);
            const result = await getSalaryHistory(contactId);
            if (result.success && result.data) {
                const data = SuperJSON.deserialize<HistoryItem[]>(result.data as SuperJSONResult);
                setHistory(data);
            }
            setLoading(false);
        }

        fetchHistory();
    }, [contactId]);

    if (loading) {
        return (
            <div className="flex justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (history.length === 0) {
        return null;
    }

    return (
        <Card className="mt-6">
            <CardHeader>
                <CardTitle>Salary History</CardTitle>
                <CardDescription>
                    Historical record of salary structure changes.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Effective Date</TableHead>
                            <TableHead>Base Salary</TableHead>
                            <TableHead>Total Components</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Created By</TableHead>
                            <TableHead className="w-[100px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {history.map((structure) => (
                            <TableRow key={structure.id}>
                                <TableCell>
                                    {format(new Date(structure.createdAt), "PPP p")}
                                </TableCell>
                                <TableCell className="font-medium">
                                    {Number(structure.baseSalary).toLocaleString()}
                                </TableCell>
                                <TableCell>{structure.items.length}</TableCell>
                                <TableCell>
                                    <Badge
                                        variant={structure.isActive ? "default" : "secondary"}
                                        className={!structure.isActive ? "bg-gray-100 text-gray-500 hover:bg-gray-200 border-gray-200" : ""}
                                    >
                                        {structure.isActive ? "Active" : "Archived"}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    {structure.createdById ? (
                                        <div className="flex items-center gap-2">
                                            <Avatar className="h-6 w-6">
                                                <AvatarFallback>{structure.createdById.substring(0, 2).toUpperCase()}</AvatarFallback>
                                            </Avatar>
                                            <span className="text-sm cursor-help" title={structure.createdById}>User</span>
                                        </div>
                                    ) : (
                                        <span className="text-muted-foreground text-sm">-</span>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <Button variant="ghost" size="sm">
                                                <Eye className="mr-2 h-4 w-4" />
                                                Details
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-2xl">
                                            <DialogHeader>
                                                <DialogTitle>Salary Structure Details</DialogTitle>
                                                <DialogDescription>
                                                    {format(new Date(structure.createdAt), "PPP p")}
                                                </DialogDescription>
                                            </DialogHeader>
                                            <div className="mt-4 space-y-4">
                                                <div className="flex justify-between items-center p-4 bg-muted/50 rounded-lg">
                                                    <span className="font-medium">Base Salary</span>
                                                    <span className="font-bold text-lg">{Number(structure.baseSalary).toLocaleString()}</span>
                                                </div>

                                                <div className="space-y-2">
                                                    <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Earnings</h4>
                                                    <div className="border rounded-md divide-y">
                                                        {structure.items
                                                            .filter(item => item.component.type === 'EARNING')
                                                            .map(item => (
                                                                <div key={item.id} className="flex justify-between p-3">
                                                                    <span>{item.component.name}</span>
                                                                    <span className="font-medium text-green-600">+{Number(item.amount).toLocaleString()}</span>
                                                                </div>
                                                            ))}
                                                        {structure.items.filter(item => item.component.type === 'EARNING').length === 0 && (
                                                            <div className="p-3 text-sm text-muted-foreground text-center">No additional earnings</div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="space-y-2">
                                                    <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Deductions</h4>
                                                    <div className="border rounded-md divide-y">
                                                        {structure.items
                                                            .filter(item => item.component.type === 'DEDUCTION')
                                                            .map(item => (
                                                                <div key={item.id} className="flex justify-between p-3">
                                                                    <span>{item.component.name}</span>
                                                                    <span className="font-medium text-red-600">-{Number(item.amount).toLocaleString()}</span>
                                                                </div>
                                                            ))}
                                                        {structure.items.filter(item => item.component.type === 'DEDUCTION').length === 0 && (
                                                            <div className="p-3 text-sm text-muted-foreground text-center">No deductions</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
