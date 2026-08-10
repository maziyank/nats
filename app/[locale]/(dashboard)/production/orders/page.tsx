"use client";
export const dynamic = "force-dynamic";

import { getProductionOrders, releaseProductionOrder, closeProductionOrder, cancelProductionOrder } from "./actions";
import { Protect } from "@/components/ui/protect";
import { Button } from "@/components/ui/button";
import { Plus, MoreHorizontal, Eye, PlayCircle, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import {
    PageListActions,
    PageListContent,
    PageListFilter,
    PageListHeader,
    PageListLayout,
    PageListTitle,
} from "@/components/layout/page/list-layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { DataTable, Column } from "@/components/ui/data-table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/hooks/use-confirm";
import { useFormatDate } from "@/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { useTransition } from "react";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

interface ProductionOrderItem {
    id: string;
    orderNumber: string;
    product: { name: string };
    billOfMaterial?: { name: string } | null;
    plannedQuantity: number;
    producedQuantity: number;
    startDate: Date | null;
    endDate: Date | null;
    status: string;
    createdAt: Date;
}

const STATUS_COLORS: Record<string, string> = {
    DRAFT: "bg-gray-500",
    RELEASED: "bg-blue-500",
    IN_PROGRESS: "bg-yellow-500",
    COMPLETED: "bg-green-500",
    CANCELLED: "bg-red-500",
};

export default function ProductionOrdersPage() {
    const t = useTranslations("Production");
    const tCommon = useTranslations("Common");
    const searchParams = useSearchParams();
    const router = useRouter();
    const page = Number(searchParams.get("page")) || 1;
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "ALL";
    const [isPending, startTransition] = useTransition();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const formatDate = useFormatDate();
    const confirm = useConfirm();

    const { data, isLoading } = useQuery({
        queryKey: ["production-orders", page, search, status],
        queryFn: async () => {
            const result = await getProductionOrders(page, 10, search, status);
            return {
                orders: Array.isArray(result.data)
                    ? []
                    : (SuperJSON.deserialize<ProductionOrderItem[]>(
                        result.data as SuperJSONResult,
                    ) as ProductionOrderItem[]),
                total: result.total,
                totalPages: result.totalPages,
            };
        },
        staleTime: 0,
        refetchOnMount: true,
    });

    const handleSearch = (value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) {
            params.set("search", value);
        } else {
            params.delete("search");
        }
        params.delete("page");
        router.push(`?${params.toString()}`);
    };

    const handleAction = async (action: (id: string) => Promise<{ success: boolean; error?: string }>, id: string, successMsg: string) => {
        startTransition(async () => {
            try {
                const result = await action(id);
                if (result.success) {
                    queryClient.invalidateQueries({ queryKey: ["production-orders"] });
                    toast({ title: tCommon("success"), description: successMsg });
                } else {
                    toast({ title: tCommon("error"), description: result.error || t("update_error"), variant: "destructive" });
                }
            } catch {
                toast({ title: tCommon("error"), description: t("update_error"), variant: "destructive" });
            }
        });
    };

    const columns: Column<ProductionOrderItem>[] = [
        {
            header: t("order_number"),
            accessorKey: "orderNumber",
            className: "font-medium",
        },
        {
            header: t("product"),
            cell: (item) => item.product?.name || "-",
        },
        {
            header: t("bom"),
            cell: (item) => item.billOfMaterial?.name || "-",
        },
        {
            header: t("planned_qty"),
            accessorKey: "plannedQuantity",
            className: "text-right",
            headerClassName: "text-right",
        },
        {
            header: t("produced_qty"),
            accessorKey: "producedQuantity",
            className: "text-right",
            headerClassName: "text-right",
        },
        {
            header: t("status"),
            cell: (item) => (
                <Badge className={STATUS_COLORS[item.status] || "bg-gray-500"}>
                    {item.status.replace("_", " ")}
                </Badge>
            ),
        },
        {
            header: t("start_date"),
            cell: (item) => item.startDate ? formatDate(item.startDate) : "-",
        },
        {
            header: "",
            className: "w-[80px]",
            cell: (order) => (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">{tCommon("actions")}</span>
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>{tCommon("actions")}</DropdownMenuLabel>
                        <DropdownMenuItem asChild>
                            <Link href={`/production/orders/${order.id}`}>
                                <Eye className="mr-2 h-4 w-4" /> {tCommon("details")}
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {order.status === "DRAFT" && (
                            <DropdownMenuItem onClick={() => handleAction(releaseProductionOrder, order.id, t("update_success"))}>
                                <PlayCircle className="mr-2 h-4 w-4" /> {t("release")}
                            </DropdownMenuItem>
                        )}
                        {(order.status === "RELEASED" || order.status === "IN_PROGRESS") && (
                            <DropdownMenuItem onClick={() => handleAction(closeProductionOrder, order.id, t("update_success"))}>
                                <CheckCircle className="mr-2 h-4 w-4" /> {t("close_order")}
                            </DropdownMenuItem>
                        )}
                        {order.status !== "COMPLETED" && order.status !== "CANCELLED" && (
                            <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => handleAction(cancelProductionOrder, order.id, t("update_success"))}
                            >
                                <XCircle className="mr-2 h-4 w-4" /> {t("cancel_order")}
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            ),
        },
    ];

    return (
        <PageListLayout>
            <PageListHeader>
                <PageListTitle title={t("title_orders")} />
                <PageListActions>
                    <Protect permission="inventory.create">
                        <Button asChild>
                            <Link href="/production/orders/new">
                                <Plus className="mr-2 h-4 w-4" /> {t("new_order")}
                            </Link>
                        </Button>
                    </Protect>
                </PageListActions>
            </PageListHeader>

            <PageListFilter>
                <Input
                    placeholder={t("search_orders")}
                    defaultValue={search}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-[250px]"
                />
            </PageListFilter>

            <PageListContent>
                {isLoading ? (
                    <Skeleton className="h-[400px] w-full" />
                ) : (
                    <DataTable
                        data={data?.orders || []}
                        columns={columns}
                        pagination={{
                            totalEntries: data?.total || 0,
                            pageSize: 10,
                            currentPage: page,
                        }}
                        emptyMessage={t("no_orders_found")}
                    />
                )}
            </PageListContent>
        </PageListLayout>
    );
}
