"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { Plus, Loader2, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
    PageListLayout,
    PageListHeader,
    PageListTitle,
    PageListActions,
    PageListContent,
    PageListFilter,
} from "@/components/layout/page/list-layout";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getAttendanceRecords, upsertAttendance, importAttendanceCsv } from "./actions";
import { getEmployeeOptions } from "../employees/actions";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { AttendanceStatus } from "@/prisma/generated/prisma/browser";
import { useToast } from "@/hooks/use-toast";
import { Protect } from "@/components/ui/protect";

type EmployeeOption = {
    id: string;
    name: string;
    employeeDetail?: { id: string; jobTitle?: string | null } | null;
};

type AttendanceRecord = {
    id: string;
    date: Date | string;
    status: AttendanceStatus;
    checkIn?: Date | string | null;
    checkOut?: Date | string | null;
    overtimeHours: number | string;
    notes?: string | null;
    employeeDetail: {
        id: string;
        contact: { id: string; name: string };
    };
};

type AttendanceListResponse = {
    items: AttendanceRecord[];
    total: number;
    page: number;
    pageSize: number;
};

type ImportResult = {
    imported: number;
    failed: number;
    errors: { row: number; message: string }[];
};

function formatTime(value?: Date | string | null) {
    if (!value) return "—";
    try {
        return format(new Date(value), "HH:mm");
    } catch {
        return "—";
    }
}

function combineDateAndTime(dateStr: string, timeStr: string): Date | undefined {
    if (!dateStr || !timeStr) return undefined;
    const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return undefined;
    const d = new Date(dateStr);
    d.setHours(Number(match[1]), Number(match[2]), Number(match[3] || 0), 0);
    return d;
}

const CSV_TEMPLATE =
    "employee_number,email,date,status,check_in,check_out,overtime_hours,notes\n" +
    "EMP001,,2026-01-15,PRESENT,08:00,17:00,0,\n" +
    ",jane@example.com,2026-01-15,LATE,09:15,18:00,1,Traffic\n";

export default function AttendancePage() {
    const t = useTranslations("HR");
    const tCommon = useTranslations("Common");
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const today = format(new Date(), "yyyy-MM-dd");
    const [from, setFrom] = useState(today);
    const [to, setTo] = useState(today);
    const [open, setOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [importing, setImporting] = useState(false);
    const [employees, setEmployees] = useState<EmployeeOption[]>([]);
    const [employeeSearch, setEmployeeSearch] = useState("");
    const [importResult, setImportResult] = useState<ImportResult | null>(null);

    const [form, setForm] = useState({
        employeeDetailId: "",
        date: today,
        status: AttendanceStatus.PRESENT as AttendanceStatus,
        checkIn: "",
        checkOut: "",
        overtimeHours: "0",
    });

    const loadEmployees = useCallback(async (search = "") => {
        const result = await getEmployeeOptions(search);
        if (result.success && result.data) {
            setEmployees(
                SuperJSON.deserialize<EmployeeOption[]>(
                    result.data as SuperJSONResult
                )
            );
        }
    }, []);

    useEffect(() => {
        loadEmployees();
    }, [loadEmployees]);

    useEffect(() => {
        const timer = setTimeout(() => {
            loadEmployees(employeeSearch);
        }, 250);
        return () => clearTimeout(timer);
    }, [employeeSearch, loadEmployees]);

    const employeeOptions = useMemo(
        () =>
            employees
                .filter((e) => e.employeeDetail?.id)
                .map((e) => ({
                    value: e.employeeDetail!.id,
                    label: e.name,
                    icon: (
                        <Avatar size="sm">
                            <AvatarFallback className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                                {e.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                    ),
                })),
        [employees]
    );

    const { data, isLoading } = useQuery({
        queryKey: ["attendance", from, to],
        queryFn: async () => {
            const result = await getAttendanceRecords({
                page: 1,
                pageSize: 50,
                from,
                to,
            });
            if (!result.success) throw new Error(result.error);
            return SuperJSON.deserialize<AttendanceListResponse>(
                result.data as SuperJSONResult
            );
        },
    });

    const resetForm = () => {
        setForm({
            employeeDetailId: "",
            date: today,
            status: AttendanceStatus.PRESENT,
            checkIn: "",
            checkOut: "",
            overtimeHours: "0",
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.employeeDetailId || !form.date) return;
        setSaving(true);
        try {
            const result = await upsertAttendance({
                employeeDetailId: form.employeeDetailId,
                date: new Date(form.date),
                status: form.status,
                checkIn: combineDateAndTime(form.date, form.checkIn),
                checkOut: combineDateAndTime(form.date, form.checkOut),
                overtimeHours: Number(form.overtimeHours) || 0,
            });
            if (result.success) {
                toast({ title: tCommon("success"), description: t("attendance_saved") });
                setOpen(false);
                resetForm();
                queryClient.invalidateQueries({ queryKey: ["attendance"] });
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
            setSaving(false);
        }
    };

    const handleImportFile = async (file: File) => {
        setImporting(true);
        setImportResult(null);
        try {
            const text = await file.text();
            const result = await importAttendanceCsv(text);
            if (result.success && result.data) {
                const data = SuperJSON.deserialize<ImportResult>(
                    result.data as SuperJSONResult
                );
                setImportResult(data);
                toast({
                    title: tCommon("success"),
                    description: t("attendance_import_result", {
                        imported: data.imported,
                        failed: data.failed,
                    }),
                });
                queryClient.invalidateQueries({ queryKey: ["attendance"] });
            } else {
                toast({
                    title: tCommon("error"),
                    description:
                        (!result.success && result.error) ||
                        t("attendance_import_failed"),
                    variant: "destructive",
                });
            }
        } catch {
            toast({
                title: tCommon("error"),
                description: t("attendance_import_failed"),
                variant: "destructive",
            });
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const downloadTemplate = () => {
        const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "attendance-import-template.csv";
        a.click();
        URL.revokeObjectURL(url);
    };

    const statusVariant = (status: string) => {
        switch (status) {
            case "PRESENT":
                return "default";
            case "ABSENT":
                return "destructive";
            case "LATE":
            case "HALF_DAY":
                return "secondary";
            default:
                return "outline";
        }
    };

    return (
        <PageListLayout>
            <PageListHeader>
                <PageListTitle title={t("attendance_title")} />
                <PageListActions>
                    <Protect permission="hr.attendance.manage">
                        <div className="flex items-center gap-2">
                            <Dialog
                                open={importOpen}
                                onOpenChange={(v) => {
                                    setImportOpen(v);
                                    if (!v) setImportResult(null);
                                }}
                            >
                                <DialogTrigger asChild>
                                    <Button variant="outline">
                                        <Upload className="h-4 w-4 mr-2" />
                                        {t("import_attendance")}
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-lg">
                                    <DialogHeader>
                                        <DialogTitle>{t("import_attendance")}</DialogTitle>
                                        <DialogDescription>
                                            {t("import_attendance_desc")}
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-2">
                                        <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                                            <p className="font-medium text-foreground">
                                                {t("import_csv_columns")}
                                            </p>
                                            <code className="block break-all">
                                                employee_number, email, date, status,
                                                check_in, check_out, overtime_hours, notes
                                            </code>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                onClick={downloadTemplate}
                                            >
                                                <Download className="h-4 w-4 mr-2" />
                                                {t("download_csv_template")}
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                disabled={importing}
                                                onClick={() => fileInputRef.current?.click()}
                                            >
                                                {importing && (
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                )}
                                                <Upload className="h-4 w-4 mr-2" />
                                                {t("choose_csv_file")}
                                            </Button>
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept=".csv,text/csv"
                                                className="hidden"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) handleImportFile(file);
                                                }}
                                            />
                                        </div>
                                        {importResult && (
                                            <div className="space-y-2 rounded-md border p-3 text-sm">
                                                <p>
                                                    {t("attendance_import_result", {
                                                        imported: importResult.imported,
                                                        failed: importResult.failed,
                                                    })}
                                                </p>
                                                {importResult.errors.length > 0 && (
                                                    <ul className="max-h-32 overflow-y-auto text-xs text-destructive space-y-1">
                                                        {importResult.errors
                                                            .slice(0, 20)
                                                            .map((err, i) => (
                                                                <li key={`${err.row}-${i}`}>
                                                                    {t("import_row_error", {
                                                                        row: err.row,
                                                                        message: err.message,
                                                                    })}
                                                                </li>
                                                            ))}
                                                    </ul>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <DialogFooter>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setImportOpen(false)}
                                        >
                                            {tCommon("close")}
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>

                            <Dialog
                                open={open}
                                onOpenChange={(v) => {
                                    setOpen(v);
                                    if (!v) resetForm();
                                }}
                            >
                                <DialogTrigger asChild>
                                    <Button>
                                        <Plus className="h-4 w-4 mr-2" />
                                        {t("record_attendance")}
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <form onSubmit={handleSubmit}>
                                        <DialogHeader>
                                            <DialogTitle>{t("record_attendance")}</DialogTitle>
                                        </DialogHeader>
                                        <div className="grid gap-4 py-4">
                                            <div className="space-y-2">
                                                <Label>{t("employee")}</Label>
                                                <SearchableSelect
                                                    value={form.employeeDetailId || null}
                                                    onValueChange={(v) =>
                                                        setForm((f) => ({
                                                            ...f,
                                                            employeeDetailId: v || "",
                                                        }))
                                                    }
                                                    options={employeeOptions}
                                                    placeholder={t("employee")}
                                                    onSearch={setEmployeeSearch}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>{t("date")}</Label>
                                                <Input
                                                    type="date"
                                                    value={form.date}
                                                    onChange={(e) =>
                                                        setForm((f) => ({
                                                            ...f,
                                                            date: e.target.value,
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-2">
                                                    <Label>{t("check_in")}</Label>
                                                    <Input
                                                        type="time"
                                                        value={form.checkIn}
                                                        onChange={(e) =>
                                                            setForm((f) => ({
                                                                ...f,
                                                                checkIn: e.target.value,
                                                            }))
                                                        }
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>{t("check_out")}</Label>
                                                    <Input
                                                        type="time"
                                                        value={form.checkOut}
                                                        onChange={(e) =>
                                                            setForm((f) => ({
                                                                ...f,
                                                                checkOut: e.target.value,
                                                            }))
                                                        }
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>{tCommon("status")}</Label>
                                                <Select
                                                    value={form.status}
                                                    onValueChange={(v) =>
                                                        setForm((f) => ({
                                                            ...f,
                                                            status: v as AttendanceStatus,
                                                        }))
                                                    }
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {Object.values(AttendanceStatus).map(
                                                            (s) => (
                                                                <SelectItem key={s} value={s}>
                                                                    {s.replace(/_/g, " ")}
                                                                </SelectItem>
                                                            )
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>{t("overtime_hours")}</Label>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    step="0.5"
                                                    value={form.overtimeHours}
                                                    onChange={(e) =>
                                                        setForm((f) => ({
                                                            ...f,
                                                            overtimeHours: e.target.value,
                                                        }))
                                                    }
                                                />
                                            </div>
                                        </div>
                                        <DialogFooter>
                                            <Button type="submit" disabled={saving}>
                                                {saving && (
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                )}
                                                {tCommon("save")}
                                            </Button>
                                        </DialogFooter>
                                    </form>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </Protect>
                </PageListActions>
            </PageListHeader>
            <PageListFilter>
                <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground">{t("from")}</Label>
                    <Input
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        className="w-[160px]"
                    />
                    <Label className="text-sm text-muted-foreground">{t("to")}</Label>
                    <Input
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        className="w-[160px]"
                    />
                </div>
            </PageListFilter>
            <PageListContent>
                {isLoading ? (
                    <Skeleton className="h-[400px] w-full" />
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("date")}</TableHead>
                                <TableHead>{t("employee")}</TableHead>
                                <TableHead>{tCommon("status")}</TableHead>
                                <TableHead>{t("check_in")}</TableHead>
                                <TableHead>{t("check_out")}</TableHead>
                                <TableHead className="text-right">
                                    {t("overtime_hours")}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(data?.items || []).map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>
                                        {format(new Date(row.date), "PP")}
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {row.employeeDetail.contact.name}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={statusVariant(row.status)}>
                                            {row.status.replace(/_/g, " ")}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{formatTime(row.checkIn)}</TableCell>
                                    <TableCell>{formatTime(row.checkOut)}</TableCell>
                                    <TableCell className="text-right">
                                        {Number(row.overtimeHours)}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {!data?.items?.length && (
                                <TableRow>
                                    <TableCell
                                        colSpan={6}
                                        className="text-center py-8 text-muted-foreground"
                                    >
                                        {t("no_attendance_found")}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                )}
            </PageListContent>
        </PageListLayout>
    );
}
