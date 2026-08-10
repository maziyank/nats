"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { format, differenceInCalendarDays } from "date-fns";
import { Plus, Loader2, Check, X } from "lucide-react";
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
import {
    getLeaveRequests,
    createLeaveRequest,
    reviewLeaveRequest,
} from "./actions";
import { getEmployeeOptions } from "../employees/actions";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { LeaveType, LeaveRequestStatus } from "@/prisma/generated/prisma/browser";
import { useToast } from "@/hooks/use-toast";
import { Protect } from "@/components/ui/protect";

type EmployeeOption = {
    id: string;
    name: string;
    employeeDetail?: { id: string } | null;
};

type LeaveRequest = {
    id: string;
    leaveType: LeaveType;
    startDate: Date | string;
    endDate: Date | string;
    days: number | string;
    reason?: string | null;
    status: LeaveRequestStatus;
    employeeDetail: {
        id: string;
        contact: { id: string; name: string };
    };
};

type LeaveListResponse = {
    items: LeaveRequest[];
    total: number;
};

export default function LeavesPage() {
    const t = useTranslations("HR");
    const tCommon = useTranslations("Common");
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [reviewingId, setReviewingId] = useState<string | null>(null);
    const [employees, setEmployees] = useState<EmployeeOption[]>([]);

    const today = format(new Date(), "yyyy-MM-dd");
    const [form, setForm] = useState({
        employeeDetailId: "",
        leaveType: LeaveType.ANNUAL as LeaveType,
        startDate: today,
        endDate: today,
        reason: "",
    });

    useEffect(() => {
        async function loadEmployees() {
            const result = await getEmployeeOptions();
            if (result.success && result.data) {
                setEmployees(
                    SuperJSON.deserialize<EmployeeOption[]>(
                        result.data as SuperJSONResult
                    )
                );
            }
        }
        loadEmployees();
    }, []);

    const { data, isLoading } = useQuery({
        queryKey: ["leaves", statusFilter],
        queryFn: async () => {
            const result = await getLeaveRequests({
                page: 1,
                pageSize: 50,
                status:
                    statusFilter === "all"
                        ? undefined
                        : (statusFilter as LeaveRequestStatus),
            });
            if (!result.success) throw new Error(result.error);
            return SuperJSON.deserialize<LeaveListResponse>(
                result.data as SuperJSONResult
            );
        },
    });

    const computedDays = () => {
        if (!form.startDate || !form.endDate) return 1;
        const start = new Date(form.startDate);
        const end = new Date(form.endDate);
        return Math.max(1, differenceInCalendarDays(end, start) + 1);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.employeeDetailId || !form.startDate || !form.endDate) return;
        setSaving(true);
        try {
            const result = await createLeaveRequest({
                employeeDetailId: form.employeeDetailId,
                leaveType: form.leaveType,
                startDate: new Date(form.startDate),
                endDate: new Date(form.endDate),
                days: computedDays(),
                reason: form.reason || undefined,
            });
            if (result.success) {
                toast({ title: tCommon("success"), description: t("leave_created") });
                setOpen(false);
                queryClient.invalidateQueries({ queryKey: ["leaves"] });
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

    const handleReview = async (
        requestId: string,
        status: "APPROVED" | "REJECTED"
    ) => {
        setReviewingId(requestId);
        try {
            const result = await reviewLeaveRequest({ requestId, status });
            if (result.success) {
                toast({
                    title: tCommon("success"),
                    description: status === "APPROVED" ? t("approve") : t("reject"),
                });
                queryClient.invalidateQueries({ queryKey: ["leaves"] });
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
            setReviewingId(null);
        }
    };

    const statusBadge = (status: string) => {
        switch (status) {
            case "APPROVED":
                return "default";
            case "REJECTED":
            case "CANCELLED":
                return "destructive";
            case "PENDING":
                return "secondary";
            default:
                return "outline";
        }
    };

    return (
        <PageListLayout>
            <PageListHeader>
                <PageListTitle title={t("leave_title")} />
                <PageListActions>
                    <Protect permission="hr.leave.manage">
                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="h-4 w-4 mr-2" />
                                {t("request_leave")}
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <form onSubmit={handleSubmit}>
                                <DialogHeader>
                                    <DialogTitle>{t("request_leave")}</DialogTitle>
                                </DialogHeader>
                                <div className="grid gap-4 py-4">
                                    <div className="space-y-2">
                                        <Label>{t("employee")}</Label>
                                        <Select
                                            value={form.employeeDetailId}
                                            onValueChange={(v) =>
                                                setForm((f) => ({
                                                    ...f,
                                                    employeeDetailId: v,
                                                }))
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder={t("employee")} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {employees
                                                    .filter((e) => e.employeeDetail?.id)
                                                    .map((e) => (
                                                        <SelectItem
                                                            key={e.id}
                                                            value={e.employeeDetail!.id}
                                                        >
                                                            {e.name}
                                                        </SelectItem>
                                                    ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>{t("leave_type")}</Label>
                                        <Select
                                            value={form.leaveType}
                                            onValueChange={(v) =>
                                                setForm((f) => ({
                                                    ...f,
                                                    leaveType: v as LeaveType,
                                                }))
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Object.values(LeaveType).map((lt) => (
                                                    <SelectItem key={lt} value={lt}>
                                                        {lt.replace(/_/g, " ")}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>{t("start_date")}</Label>
                                            <Input
                                                type="date"
                                                value={form.startDate}
                                                onChange={(e) =>
                                                    setForm((f) => ({
                                                        ...f,
                                                        startDate: e.target.value,
                                                    }))
                                                }
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>{t("end_date")}</Label>
                                            <Input
                                                type="date"
                                                value={form.endDate}
                                                onChange={(e) =>
                                                    setForm((f) => ({
                                                        ...f,
                                                        endDate: e.target.value,
                                                    }))
                                                }
                                            />
                                        </div>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {t("days")}: {computedDays()}
                                    </p>
                                    <div className="space-y-2">
                                        <Label>{t("reason")}</Label>
                                        <Input
                                            value={form.reason}
                                            onChange={(e) =>
                                                setForm((f) => ({
                                                    ...f,
                                                    reason: e.target.value,
                                                }))
                                            }
                                            placeholder={t("reason")}
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
                    </Protect>
                </PageListActions>
            </PageListHeader>
            <PageListFilter>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder={tCommon("status")} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t("all")}</SelectItem>
                        {Object.values(LeaveRequestStatus).map((s) => (
                            <SelectItem key={s} value={s}>
                                {s}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </PageListFilter>
            <PageListContent>
                {isLoading ? (
                    <Skeleton className="h-[400px] w-full" />
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("employee")}</TableHead>
                                <TableHead>{t("leave_type")}</TableHead>
                                <TableHead>{t("start_date")}</TableHead>
                                <TableHead>{t("end_date")}</TableHead>
                                <TableHead className="text-right">{t("days")}</TableHead>
                                <TableHead>{tCommon("status")}</TableHead>
                                <TableHead className="text-right">
                                    {tCommon("actions")}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(data?.items || []).map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell className="font-medium">
                                        {row.employeeDetail.contact.name}
                                    </TableCell>
                                    <TableCell>
                                        {row.leaveType.replace(/_/g, " ")}
                                    </TableCell>
                                    <TableCell>
                                        {format(new Date(row.startDate), "PP")}
                                    </TableCell>
                                    <TableCell>
                                        {format(new Date(row.endDate), "PP")}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {Number(row.days)}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={statusBadge(row.status)}>
                                            {row.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {row.status === "PENDING" && (
                                            <Protect permission="hr.leave.manage">
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    size="sm"
                                                    variant="default"
                                                    className="bg-green-600 hover:bg-green-700"
                                                    disabled={reviewingId === row.id}
                                                    onClick={() =>
                                                        handleReview(row.id, "APPROVED")
                                                    }
                                                >
                                                    {reviewingId === row.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Check className="h-4 w-4" />
                                                    )}
                                                    <span className="ml-1">{t("approve")}</span>
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    disabled={reviewingId === row.id}
                                                    onClick={() =>
                                                        handleReview(row.id, "REJECTED")
                                                    }
                                                >
                                                    <X className="h-4 w-4" />
                                                    <span className="ml-1">{t("reject")}</span>
                                                </Button>
                                            </div>
                                            </Protect>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {!data?.items?.length && (
                                <TableRow>
                                    <TableCell
                                        colSpan={7}
                                        className="text-center py-8 text-muted-foreground"
                                    >
                                        {t("no_leaves_found")}
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
