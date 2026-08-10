"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, Warehouse, Package, Ruler } from "lucide-react";
import { saveInitialWarehouse } from "../actions";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_UNITS, DEFAULT_CATEGORIES } from "@/services/lib/setup/chart-of-accounts-template";

interface StepWarehouseProps {
    onComplete: () => void;
    existingWarehouseCount: number;
    existingUnitCount: number;
}

export function StepWarehouse({
    onComplete,
    existingWarehouseCount,
    existingUnitCount,
}: StepWarehouseProps) {
    const [isPending, startTransition] = useTransition();
    const [isDone, setIsDone] = useState(
        existingWarehouseCount > 0 && existingUnitCount > 0
    );
    const { toast } = useToast();

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);

        const data = {
            name: formData.get("warehouseName") as string,
            location: formData.get("warehouseLocation") as string,
        };

        startTransition(async () => {
            const result = await saveInitialWarehouse(data);
            if (result.success) {
                setIsDone(true);
                toast({
                    title: "Warehouse & basics created",
                    description: "Your warehouse, units, and categories have been set up.",
                });
                onComplete();
            } else {
                toast({
                    title: "Error",
                    description: result.error || "Failed to create warehouse",
                    variant: "destructive",
                });
            }
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-semibold">Warehouse & Basics</h2>
                <p className="text-muted-foreground mt-1">
                    Set up your first warehouse and default measurement units. You can add more later.
                </p>
            </div>

            {isDone ? (
                <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <div>
                        <p className="font-medium text-green-700 dark:text-green-300">
                            Warehouse & basics are configured
                        </p>
                        <p className="text-sm text-green-600 dark:text-green-400">
                            You can manage warehouses and units in Inventory settings.
                        </p>
                    </div>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="rounded-lg border p-4 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Warehouse className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">First Warehouse</span>
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="warehouseName">Warehouse Name *</Label>
                                <Input
                                    id="warehouseName"
                                    name="warehouseName"
                                    required
                                    placeholder="e.g. Main Warehouse"
                                    defaultValue="Main Warehouse"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="warehouseLocation">Location</Label>
                                <Input
                                    id="warehouseLocation"
                                    name="warehouseLocation"
                                    placeholder="e.g. New York"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-lg border p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Ruler className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">Default Units</span>
                            </div>
                            <div className="space-y-1">
                                {DEFAULT_UNITS.map((unit) => (
                                    <div
                                        key={unit.symbol}
                                        className="flex items-center justify-between text-sm py-1"
                                    >
                                        <span>{unit.name}</span>
                                        <span className="text-muted-foreground font-mono">{unit.symbol}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-lg border p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Package className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium">Default Categories</span>
                            </div>
                            <div className="space-y-1">
                                {DEFAULT_CATEGORIES.map((cat) => (
                                    <div
                                        key={cat.name}
                                        className="text-sm py-1"
                                    >
                                        <span className="font-medium">{cat.name}</span>
                                        <span className="text-muted-foreground ml-2">— {cat.description}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button type="submit" disabled={isPending}>
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create & Continue
                        </Button>
                    </div>
                </form>
            )}

            {isDone && (
                <div className="flex justify-end">
                    <Button onClick={onComplete}>Continue</Button>
                </div>
            )}
        </div>
    );
}
