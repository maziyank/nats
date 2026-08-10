"use client";

import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    TableFooter,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2, Edit } from "lucide-react";
import { configureSalaryStructure, getSalaryComponents } from "@/app/[locale]/(dashboard)/hr/payroll/actions";
import { SalaryComponentType } from "@/prisma/generated/prisma/browser";

interface SalaryItem {
    componentId: string;
    amount: number;
    formula: string;
    typePlaceholder?: SalaryComponentType;
    component?: {
        id: string;
        name: string;
        type: SalaryComponentType;
    };
}

import { SalaryComponent, SalaryStructure, SalaryStructureItem } from "@/prisma/generated/prisma/client";

interface SalaryStructureWithDetails extends SalaryStructure {
    items: (SalaryStructureItem & {
        component: SalaryComponent;
    })[];
}

interface SalaryStructureEditorProps {
    contactId: string;
    initialStructure: SuperJSONResult | null;
}

export function SalaryStructureEditor({ contactId, initialStructure }: SalaryStructureEditorProps) {
    const { toast } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);

    const [baseSalary, setBaseSalary] = useState<number>(0);
    const [items, setItems] = useState<SalaryItem[]>([]);
    const [availableComponents, setAvailableComponents] = useState<SalaryComponent[]>([]);

    useEffect(() => {
        if (initialStructure) {
            const structure = SuperJSON.deserialize<SalaryStructureWithDetails>(initialStructure);
            if (!structure) return;

            setBaseSalary(Number(structure.baseSalary));
            setItems(
                structure.items?.map((item) => ({
                    componentId: item.componentId,
                    amount: Number(item.amount),
                    formula: item.formula || "",
                    component: item.component,
                })) ?? []
            );
        }
    }, [initialStructure]);

    useEffect(() => {
        async function fetchComponents() {
            const result = await getSalaryComponents();
            if (result.success) {
                const data = result.data ? SuperJSON.deserialize<SalaryComponent[]>(result.data) : [];
                setAvailableComponents(data);
            }
        }
        if (isEditing) {
            fetchComponents();
        }
    }, [isEditing]);

    const handleAddItem = (type: SalaryComponentType) => {
        setItems([...items, { componentId: "", amount: 0, formula: "", typePlaceholder: type }]);
    };

    const handleRemoveItem = (index: number) => {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
    };

    const handleItemChange = (index: number, field: keyof SalaryItem, value: any) => {
        const newItems = [...items];
        if (field === "componentId") {
            const component = availableComponents.find((c) => c.id === value);
            newItems[index] = { ...newItems[index], componentId: value, component };
        } else {
            newItems[index] = { ...newItems[index], [field]: value };
        }
        setItems(newItems);
    };

    const handleSave = async () => {
        if (!baseSalary || baseSalary < 0) {
            toast({ title: "Error", description: "Base Salary is required and must be positive", variant: "destructive" });
            return;
        }

        for (const item of items) {
            if (!item.componentId) {
                toast({ title: "Error", description: "All items must have a selected component", variant: "destructive" });
                return;
            }
            // Amount can be 0 when formula is provided
            if ((item.amount === undefined || item.amount === null || Number(item.amount) < 0) && !item.formula) {
                toast({
                    title: "Error",
                    description: `Amount or formula for ${item.component?.name || "item"} is required`,
                    variant: "destructive",
                });
                return;
            }
        }

        setLoading(true);
        try {
            const result = await configureSalaryStructure({
                name: "Standard Structure",
                contactId,
                baseSalary,
                items: items.map((item) => ({
                    componentId: item.componentId,
                    amount: item.amount,
                    formula: item.formula,
                })),
            });

            if (result.success) {
                toast({ title: "Success", description: "Salary structure updated" });
                setIsEditing(false);
            } else {
                toast({ title: "Error", description: result.error, variant: "destructive" });
            }
        } catch {
            toast({ title: "Error", description: "Failed to save", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const { totalEarnings, totalDeductions, netSalary } = useMemo(() => {
        const earnings = items
            .filter((i) => (i.component?.type || i.typePlaceholder) === SalaryComponentType.EARNING)
            .reduce((sum, i) => sum + Number(i.amount), 0);
        const deductions = items
            .filter((i) => (i.component?.type || i.typePlaceholder) === SalaryComponentType.DEDUCTION)
            .reduce((sum, i) => sum + Number(i.amount), 0);
        return {
            totalEarnings: baseSalary + earnings,
            totalDeductions: deductions,
            netSalary: baseSalary + earnings - deductions,
        };
    }, [baseSalary, items]);

    if (!isEditing) {
        return (
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Salary Structure</CardTitle>
                    <Button onClick={() => setIsEditing(true)} variant="outline">
                        <Edit className="mr-2 h-4 w-4" />
                        Edit Structure
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Component</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {/* Base Salary row */}
                                <TableRow>
                                    <TableCell className="font-medium">Base Salary</TableCell>
                                    <TableCell>
                                        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 border-transparent">
                                            Base
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        {baseSalary.toLocaleString()}
                                    </TableCell>
                                </TableRow>

                                {/* Earnings rows */}
                                {items
                                    .filter((i) => (i.component?.type || i.typePlaceholder) === SalaryComponentType.EARNING)
                                    .map((item, idx) => (
                                        <TableRow key={`earning-${idx}`}>
                                            <TableCell>{item.component?.name}</TableCell>
                                            <TableCell>
                                                <Badge className="bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 border-transparent">
                                                    Earning
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                +{Number(item.amount).toLocaleString()}
                                            </TableCell>
                                        </TableRow>
                                    ))}

                                {/* Deductions rows */}
                                {items
                                    .filter((i) => (i.component?.type || i.typePlaceholder) === SalaryComponentType.DEDUCTION)
                                    .map((item, idx) => (
                                        <TableRow key={`deduction-${idx}`}>
                                            <TableCell>{item.component?.name}</TableCell>
                                            <TableCell>
                                                <Badge variant="destructive" className="border-transparent">
                                                    Deduction
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right text-red-600 dark:text-red-400">
                                                -{Number(item.amount).toLocaleString()}
                                            </TableCell>
                                        </TableRow>
                                    ))}

                                {items.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                                            No salary components configured yet.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                            <TableFooter>
                                <TableRow>
                                    <TableCell colSpan={2} className="font-semibold">
                                        Total Earnings
                                    </TableCell>
                                    <TableCell className="text-right font-semibold">
                                        {totalEarnings.toLocaleString()}
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableCell colSpan={2} className="font-semibold text-red-600 dark:text-red-400">
                                        Total Deductions
                                    </TableCell>
                                    <TableCell className="text-right font-semibold text-red-600 dark:text-red-400">
                                        -{totalDeductions.toLocaleString()}
                                    </TableCell>
                                </TableRow>
                                <TableRow className="bg-muted/50">
                                    <TableCell colSpan={2} className="font-bold text-lg">
                                        Net Salary
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-lg">
                                        {netSalary.toLocaleString()}
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Edit Salary Structure</CardTitle>
                <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setIsEditing(false)} disabled={loading}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Changes
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Component</TableHead>
                                <TableHead className="w-[120px]">Type</TableHead>
                                <TableHead className="w-[160px]">Amount</TableHead>
                                <TableHead className="w-[180px]">Formula</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {/* Base Salary – always first, always editable */}
                            <TableRow className="bg-muted/30">
                                <TableCell className="font-medium">Base Salary</TableCell>
                                <TableCell>
                                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-transparent">
                                        Base
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <Input
                                        type="number"
                                        value={baseSalary}
                                        onChange={(e) => setBaseSalary(Number(e.target.value))}
                                        className="h-8"
                                    />
                                </TableCell>
                                <TableCell></TableCell>
                            </TableRow>

                            {/* Separator row for Earnings section */}
                            <TableRow className="bg-green-50/50 dark:bg-green-900/10 hover:bg-green-50/50">
                                <TableCell colSpan={4} className="py-2">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-green-700 dark:text-green-400">
                                        Earnings
                                    </span>
                                </TableCell>
                                <TableCell className="py-2">
                                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => handleAddItem(SalaryComponentType.EARNING)}>
                                        <Plus className="h-3 w-3" />
                                    </Button>
                                </TableCell>
                            </TableRow>

                            {/* Earnings rows */}
                            {items.map((item, idx) => {
                                const itemType = item.component?.type || item.typePlaceholder;
                                if (itemType !== SalaryComponentType.EARNING) return null;

                                return (
                                    <TableRow key={`earning-${idx}`}>
                                        <TableCell>
                                            <Select
                                                value={item.componentId}
                                                onValueChange={(val) => handleItemChange(idx, "componentId", val)}
                                            >
                                                <SelectTrigger className="h-8">
                                                    <SelectValue placeholder="Select component" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableComponents
                                                        .filter((c) => c.type === SalaryComponentType.EARNING)
                                                        .map((c) => (
                                                            <SelectItem key={c.id} value={c.id}>
                                                                {c.name}
                                                            </SelectItem>
                                                        ))}
                                                </SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell>
                                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-transparent">
                                                Earning
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                type="number"
                                                value={item.amount}
                                                onChange={(e) => handleItemChange(idx, "amount", Number(e.target.value))}
                                                className="h-8"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                type="text"
                                                value={item.formula || ""}
                                                onChange={(e) => handleItemChange(idx, "formula", e.target.value || undefined)}
                                                placeholder="e.g. BASE * 0.1"
                                                className="h-8 font-mono text-xs"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleRemoveItem(idx)}>
                                                <Trash2 className="h-3 w-3 text-red-500" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}

                            {/* Separator row for Deductions section */}
                            <TableRow className="bg-red-50/50 dark:bg-red-900/10 hover:bg-red-50/50">
                                <TableCell colSpan={4} className="py-2">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-400">
                                        Deductions
                                    </span>
                                </TableCell>
                                <TableCell className="py-2">
                                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => handleAddItem(SalaryComponentType.DEDUCTION)}>
                                        <Plus className="h-3 w-3" />
                                    </Button>
                                </TableCell>
                            </TableRow>

                            {/* Deductions rows */}
                            {items.map((item, idx) => {
                                const itemType = item.component?.type || item.typePlaceholder;
                                if (itemType !== SalaryComponentType.DEDUCTION) return null;

                                return (
                                    <TableRow key={`deduction-${idx}`}>
                                        <TableCell>
                                            <Select
                                                value={item.componentId}
                                                onValueChange={(val) => handleItemChange(idx, "componentId", val)}
                                            >
                                                <SelectTrigger className="h-8">
                                                    <SelectValue placeholder="Select component" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableComponents
                                                        .filter((c) => c.type === SalaryComponentType.DEDUCTION)
                                                        .map((c) => (
                                                            <SelectItem key={c.id} value={c.id}>
                                                                {c.name}
                                                            </SelectItem>
                                                        ))}
                                                </SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="destructive" className="border-transparent">
                                                Deduction
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                type="number"
                                                value={item.amount}
                                                onChange={(e) => handleItemChange(idx, "amount", Number(e.target.value))}
                                                className="h-8"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                type="text"
                                                value={item.formula || ""}
                                                onChange={(e) => handleItemChange(idx, "formula", e.target.value || undefined)}
                                                placeholder="e.g. GROSS * 0.02"
                                                className="h-8 font-mono text-xs"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleRemoveItem(idx)}>
                                                <Trash2 className="h-3 w-3 text-red-500" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                        <TableFooter>
                            <TableRow>
                                <TableCell colSpan={2} className="font-semibold">Total Earnings</TableCell>
                                <TableCell className="text-right font-semibold">{totalEarnings.toLocaleString()}</TableCell>
                                <TableCell colSpan={2}></TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell colSpan={2} className="font-semibold text-red-600 dark:text-red-400">Total Deductions</TableCell>
                                <TableCell className="text-right font-semibold text-red-600 dark:text-red-400">-{totalDeductions.toLocaleString()}</TableCell>
                                <TableCell colSpan={2}></TableCell>
                            </TableRow>
                            <TableRow className="bg-muted/50">
                                <TableCell colSpan={2} className="font-bold text-lg">Net Salary</TableCell>
                                <TableCell className="text-right font-bold text-lg">{netSalary.toLocaleString()}</TableCell>
                                <TableCell colSpan={2}></TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}
