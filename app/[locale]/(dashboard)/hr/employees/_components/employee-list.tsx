"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Protect } from "@/components/ui/protect";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    PageListLayout,
    PageListHeader,
    PageListTitle,
    PageListActions,
    PageListContent,
    PageListFilter,
} from "@/components/layout/page/list-layout";
import { Column, DataTable } from "@/components/ui/data-table";
import { getEmployees } from "../actions";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { Contact, EmployeeDetail, Department } from "@/prisma/generated/prisma/client";
import { useDebounce } from "@/hooks/use-debounce";

const DEFAULT_PAGE_SIZE = 10;

type Employee = Contact & {
    employeeDetail:
        | (EmployeeDetail & {
              departmentRef?: Department | null;
          })
        | null;
};

interface EmployeeListResponse {
    items: Employee[];
    totalPages: number;
    total: number;
}

export function EmployeeList() {
    const t = useTranslations("HR");
    const tCommon = useTranslations("Common");
    const searchParams = useSearchParams();
    const router = useRouter();

    const page = Number(searchParams.get("page")) || 1;
    const search = searchParams.get("search") || "";
    const isActiveParam = searchParams.get("isActive");

    const [searchInput, setSearchInput] = useState(search);
    const debouncedSearch = useDebounce(searchInput, 500);

    const isActiveFilter =
        isActiveParam === "true" ? true : isActiveParam === "false" ? false : undefined;

    useEffect(() => {
        const currentSearch = searchParams.get("search") || "";
        if (debouncedSearch === currentSearch) return;

        const params = new URLSearchParams(searchParams.toString());
        if (debouncedSearch) {
            params.set("search", debouncedSearch);
        } else {
            params.delete("search");
        }
        params.delete("page");
        router.push(`?${params.toString()}`);
    }, [debouncedSearch, router, searchParams]);

    const { data, isLoading } = useQuery({
        queryKey: ["employees", page, search, isActiveFilter],
        queryFn: async () => {
            const result = await getEmployees(page, DEFAULT_PAGE_SIZE, search, undefined, isActiveFilter);
            if (!result.success) {
                throw new Error(result.error);
            }
            return SuperJSON.deserialize<EmployeeListResponse>(
                result.data as SuperJSONResult
            );
        },
        staleTime: 0,
        refetchOnMount: true,
    });

    const handleActiveFilter = (value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value === "all") {
            params.delete("isActive");
        } else {
            params.set("isActive", value);
        }
        params.delete("page");
        router.push(`?${params.toString()}`);
    };

    const columns: Column<Employee>[] = [
        {
            header: t("employee_number"),
            cell: (item) => item.employeeDetail?.employeeNumber || "—",
        },
        {
            header: t("name"),
            cell: (item) => (
                <Link
                    href={`/hr/employees/${item.id}`}
                    className="font-medium hover:underline"
                >
                    {item.name}
                </Link>
            ),
        },
        {
            header: t("department"),
            cell: (item) =>
                item.employeeDetail?.departmentRef?.name ||
                item.employeeDetail?.department ||
                "—",
        },
        {
            header: t("job_title"),
            cell: (item) => item.employeeDetail?.jobTitle || "—",
        },
        {
            header: tCommon("status"),
            cell: (item) => (
                <Badge variant={item.isActive ? "default" : "secondary"}>
                    {item.isActive ? t("active") : t("inactive")}
                </Badge>
            ),
        },
        {
            header: t("email"),
            accessorKey: "email",
            cell: (item) => item.email || "—",
        },
        {
            header: tCommon("actions"),
            className: "text-right",
            cell: (item) => (
                <div className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href={`/hr/employees/${item.id}`}>
                            {tCommon("view")}
                        </Link>
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <PageListLayout>
            <PageListHeader>
                <PageListTitle title={t("employees")} />
                <PageListActions>
                    <Button asChild>
                        <Link href="/hr/employees/new">
                            <Plus className="h-4 w-4" /> {t("add_employee")}
                        </Link>
                    </Button>
                </PageListActions>
            </PageListHeader>
            <PageListFilter>
                <Input
                    placeholder={t("search_employees")}
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="w-[250px] me-2"
                />
                <Select
                    value={isActiveParam ?? "all"}
                    onValueChange={handleActiveFilter}
                >
                    <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder={tCommon("status")} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t("all")}</SelectItem>
                        <SelectItem value="true">{t("active")}</SelectItem>
                        <SelectItem value="false">{t("inactive")}</SelectItem>
                    </SelectContent>
                </Select>
            </PageListFilter>
            <PageListContent>
                {isLoading ? (
                    <Skeleton className="h-[400px] w-full" />
                ) : (
                    <DataTable
                        columns={columns}
                        data={data?.items || []}
                        pagination={{
                            totalEntries: data?.total || 0,
                            pageSize: DEFAULT_PAGE_SIZE,
                            currentPage: page,
                        }}
                        emptyMessage={t("no_employees_found")}
                    />
                )}
            </PageListContent>
        </PageListLayout>
    );
}
