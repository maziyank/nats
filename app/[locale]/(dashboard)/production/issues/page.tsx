"use client";
export const dynamic = "force-dynamic";

import { getProductionIssues, issueMaterials, cancelProductionIssue } from "./actions";
import { Protect } from "@/components/ui/protect";
import { Button } from "@/components/ui/button";
import { Plus, MoreHorizontal, Eye, PackageMinus, XCircle } from "lucide-react";
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
import { useFormatDate } from "@/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { useTransition } from "react";
import { useToast } from "@/hooks/use-toast";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

interface ProductionIssueItem {
    id: string;
    issueNumber: string;
    productionOrder: { orderNumber: string };
    issueDate: Date;
    status: string;
    items: unknown[];
    createdAt: Date;
}

const STATUS_COLORS: Record<string, string> = {
    DRAFT: "bg-gray-500",
    ISSUED: "bg-green-500",
    CANCELLED: "bg-red-500",
};

export default function ProductionIssuesPage() {
    const t = useTranslations("Production");
    const tCommon = useTranslations("Common");
    const searchParams = useSearchParams();
    const router = useRouter();
    const page = Number(searchParams.get("page")) || 1;
    const search = searchParams.get("search") || "";
    const [isPending, startTransition] = useTransition();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const formatDate = useFormatDate();

    const { data, isLoading } = useQuery({
        queryKey: ["production-issues", page, search],
        queryFn: async () => {
            const result = await getProductionIssues(page, 10, search);
            return {
                issues: Array.isArray(result.data)
                    ? []
                    : (SuperJSON.deserialize<ProductionIssueItem[]>(
                        result.data as SuperJSONResult,
                    ) as ProductionIssueItem[]),
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
                    queryClient.invalidateQueries({ queryKey: ["production-issues"] });
                    toast({ title: tCommon("success"), description: successMsg });
                } else {
                    toast({ title: tCommon("error"), description: result.error || t("update_error"), variant: "destructive" });
                }
            } catch {
                toast({ title: tCommon("error"), description: t("update_error"), variant: "destructive" });
            }
        });
    };

    const columns: Column<ProductionIssueItem>[] = [
        {
            header: t("issue_number"),
            accessorKey: "issueNumber",
            className: "font-medium",
        },
        {
            header: t("order_number"),
            cell: (item) => item.productionOrder?.orderNumber || "-",
        },
        {
            header: t("issue_date"),
            cell: (item) => formatDate(item.issueDate),
        },
        {
            header: t("items"),
            cell: (item) => item.items?.length || 0,
            className: "text-right",
            headerClassName: "text-right",
        },
        {
            header: t("status"),
            cell: (item) => (
                <Badge className={STATUS_COLORS[item.status] || "bg-gray-500"}>
                    {item.status}
                </Badge>
            ),
        },
        {
            header: "",
            className: "w-[80px]",
            cell: (issue) => (
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
                            <Link href={`/production/issues/${issue.id}`}>
                                <Eye className="mr-2 h-4 w-4" /> {tCommon("details")}
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {issue.status === "DRAFT" && (
                            <>
                                <DropdownMenuItem onClick={() => handleAction(issueMaterials, issue.id, t("update_success"))}>
                                    <PackageMinus className="mr-2 h-4 w-4" /> {t("issue_materials")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className="text-red-600"
                                    onClick={() => handleAction(cancelProductionIssue, issue.id, t("update_success"))}
                                >
                                    <XCircle className="mr-2 h-4 w-4" /> {tCommon("cancel")}
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            ),
        },
    ];

    return (
        <PageListLayout>
            <PageListHeader>
                <PageListTitle title={t("title_issues")} />
                <PageListActions>

                    <Protect permission="inventory.create">
                        <Button asChild>
                            <Link href="/production/issues/new">
                                <Plus className="mr-2 h-4 w-4" /> {t("new_issue")}
                            </Link>
                        </Button>
                    </Protect>
                </PageListActions>
            </PageListHeader>

            <PageListFilter>
                <Input
                    placeholder={t("search_issues")}
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
                        data={data?.issues || []}
                        columns={columns}
                        pagination={{
                            totalEntries: data?.total || 0,
                            pageSize: 10,
                            currentPage: page,
                        }}
                        emptyMessage={t("no_issues_found")}
                    />
                )}
            </PageListContent>
        </PageListLayout>
    );
}
