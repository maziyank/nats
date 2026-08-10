"use client";
export const dynamic = "force-dynamic";

import { getBOMs, deleteBOM } from "./actions";
import { Protect } from "@/components/ui/protect";
import { Button } from "@/components/ui/button";
import { Plus, MoreHorizontal, Eye, Trash2 } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useTransition } from "react";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

interface BOMListItem {
    id: string;
    bomNumber: string;
    name: string;
    product: { name: string };
    quantity: number;
    isActive: boolean;
    items: unknown[];
    createdAt: Date;
}

export default function BOMsPage() {
    const t = useTranslations("Production");
    const tCommon = useTranslations("Common");
    const searchParams = useSearchParams();
    const router = useRouter();
    const page = Number(searchParams.get("page")) || 1;
    const search = searchParams.get("search") || "";
    const [isPending, startTransition] = useTransition();
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const { data, isLoading } = useQuery({
        queryKey: ["boms", page, search],
        queryFn: async () => {
            const result = await getBOMs(page, 10, search);
            return {
                boms: Array.isArray(result.data)
                    ? []
                    : (SuperJSON.deserialize<BOMListItem[]>(
                        result.data as SuperJSONResult,
                    ) as BOMListItem[]),
                total: result.total,
                totalPages: result.totalPages,
            };
        },
        staleTime: 0,
        refetchOnMount: true,
    });

    const confirm = useConfirm();

    const handleDeleteClick = async (id: string) => {
        if (
            await confirm({
                title: t("delete_bom"),
                description: t("delete_bom_desc"),
                confirmText: tCommon("delete"),
                variant: "destructive",
            })
        ) {
            startTransition(async () => {
                try {
                    await deleteBOM(id);
                    queryClient.invalidateQueries({ queryKey: ["boms"] });
                    toast({
                        title: tCommon("success"),
                        description: t("delete_success"),
                    });
                } catch {
                    toast({
                        title: tCommon("error"),
                        description: t("delete_error"),
                        variant: "destructive",
                    });
                }
            });
        }
    };

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

    const columns: Column<BOMListItem>[] = [
        {
            header: t("bom_number"),
            accessorKey: "bomNumber",
            className: "font-medium",
        },
        {
            header: t("name"),
            accessorKey: "name",
        },
        {
            header: t("product"),
            cell: (item) => item.product?.name || "-",
        },
        {
            header: t("quantity"),
            accessorKey: "quantity",
            className: "text-right",
            headerClassName: "text-right",
        },
        {
            header: t("items"),
            cell: (item) =>
                // Prefer _count from slim list query; fall back to items array for detail payloads.
                (item as { _count?: { items?: number }; items?: unknown[] })._count?.items ??
                item.items?.length ??
                0,
            className: "text-right",
            headerClassName: "text-right",
        },
        {
            header: t("is_active"),
            cell: (item) => (
                <Badge className={item.isActive ? "bg-green-500" : "bg-gray-500"}>
                    {item.isActive ? tCommon("active") : tCommon("inactive")}
                </Badge>
            ),
        },
        {
            header: "",
            className: "w-[80px]",
            cell: (bom) => (
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
                            <Link href={`/production/boms/${bom.id}`}>
                                <Eye className="mr-2 h-4 w-4" /> {tCommon("details")}
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <Protect permission="inventory.delete">
                            <DropdownMenuItem
                                className="text-red-600 focus:bg-red-50 focus:text-red-900 dark:focus:bg-red-900/10"
                                onClick={() => handleDeleteClick(bom.id)}
                            >
                                <Trash2 className="mr-2 h-4 w-4" /> {tCommon("delete")}
                            </DropdownMenuItem>
                        </Protect>
                    </DropdownMenuContent>
                </DropdownMenu>
            ),
        },
    ];

    return (
        <PageListLayout>
            <PageListHeader>
                <PageListTitle title={t("title_boms")} />
                <PageListActions>

                    <Protect permission="inventory.create">
                        <Button asChild>
                            <Link href="/production/boms/new">
                                <Plus className="h-4 w-4" /> {t("new_bom")}
                            </Link>
                        </Button>
                    </Protect>
                </PageListActions>
            </PageListHeader>

            <PageListFilter>
                <Input
                    placeholder={t("search_boms")}
                    defaultValue={search}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-[250px] me-2"
                />
            </PageListFilter>

            <PageListContent>
                {isLoading ? (
                    <Skeleton className="h-[400px] w-full" />
                ) : (
                    <DataTable
                        data={data?.boms || []}
                        columns={columns}
                        pagination={{
                            totalEntries: data?.total || 0,
                            pageSize: 10,
                            currentPage: page,
                        }}
                        emptyMessage={t("no_boms_found")}
                    />
                )}
            </PageListContent>
        </PageListLayout>
    );
}
