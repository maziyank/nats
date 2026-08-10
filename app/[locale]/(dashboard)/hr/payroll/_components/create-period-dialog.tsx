"use strict";
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { createPayrollPeriod } from "../actions";
import { useToast } from "@/hooks/use-toast";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/services/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

import { useTranslations } from "next-intl";

export function CreatePeriodDialog() {
    const t = useTranslations("HR");
    const tCommon = useTranslations("Common");
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [startDate, setStartDate] = useState<Date>();
    const [endDate, setEndDate] = useState<Date>();
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!startDate || !endDate || !name) return;

        setLoading(true);
        try {
            const result = await createPayrollPeriod({
                name,
                startDate,
                endDate,
            });

            if (result.success) {
                toast({
                    title: tCommon("success"),
                    description: t("period_created_success"),
                });
                setOpen(false);
                setName("");
                setStartDate(undefined);
                setEndDate(undefined);
            } else {
                toast({
                    title: tCommon("error"),
                    description: result.error,
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: tCommon("error"),
                description: "Something went wrong",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="mr-2 h-4 w-4" /> {t("new_period")}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t("new_payroll_period")}</DialogTitle>
                    <DialogDescription>
                        {t("payroll_period_desc")}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">{t("name")}</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., January 2024"
                            required
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label>{t("start_date")}</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !startDate && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {startDate ? format(startDate, "PPP") : <span>{t("pick_date")}</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={startDate}
                                    onSelect={setStartDate}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                    <div className="grid gap-2">
                        <Label>{t("end_date")}</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !endDate && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {endDate ? format(endDate, "PPP") : <span>{t("pick_date")}</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={endDate}
                                    onSelect={setEndDate}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading}>
                            {loading ? t("creating") : t("create_period")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
