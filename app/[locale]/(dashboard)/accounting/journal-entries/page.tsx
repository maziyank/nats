"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { CustomInput } from "@/components/ui/custom-input";
import { CustomSelect } from "@/components/ui/custom-select";
import { DataTable, Column } from "@/components/ui/data-table";
import {
  useConfirm,
  useAlert,
  useFormatCurrency,
  useFormatDate,
} from "@/hooks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Plus,
  Eye,
  Pencil,
  Trash2,
  CheckCircle,
} from "lucide-react";
import Link from "next/link";
import {
  getJournalEntries,
  deleteJournalEntry,
  postJournalEntry,
} from "./actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { Protect } from "@/components/ui/protect";
import {
  PageListActions,
  PageListContent,
  PageListFilter,
  PageListHeader,
  PageListLayout,
  PageListTitle,
} from "@/components/layout/page/list-layout";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { SelectItem } from "@/components/ui/select";
import { SuperJSON } from "@/services/lib/superjson";
import { JournalEntryWithDetails } from "../types";
import { Decimal } from "decimal.js";

import { useTranslations } from "next-intl";

export default function JournalEntryPage() {
  const t = useTranslations("Accounting");
  const tCommon = useTranslations("Common");
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const formatDate = useFormatDate();
  const formatCurrency = useFormatCurrency();
  const confirm = useConfirm();
  const alert = useAlert();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: [
      "journal-entries",
      { page, startDate, endDate, status, search: debouncedSearch },
    ],
    queryFn: async () => {
      const res = await getJournalEntries({
        page,
        startDate,
        endDate,
        status,
        search: debouncedSearch,
      });
      if (res.success && res.data) {
        return {
          items: SuperJSON.deserialize<JournalEntryWithDetails[]>(
            res.data.items,
          ),
          pagination: res.data.pagination,
        };
      }
      return null;
    },
    placeholderData: keepPreviousData,
  });

  const entries = data?.items || [];
  const total = data?.pagination.total || 0;

  const deleteMutation = useMutation({
    mutationFn: deleteJournalEntry,
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      } else {
        alert({
          title: tCommon("error"),
          description: "error" in res ? res.error : "Unknown error",
        });
      }
    },
  });

  const postMutation = useMutation({
    mutationFn: postJournalEntry,
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      } else {
        alert({
          title: tCommon("error"),
          description: "error" in res ? res.error : "Unknown error",
        });
      }
    },
  });

  const handleDelete = useMemo(
    () => async (entry: JournalEntryWithDetails) => {
      if (
        await confirm({
          title: tCommon("are_you_sure") || "Are you sure?",
          description: (
            <>
              {t("delete_account_desc")}
              <span className="font-medium text-foreground">
                {" "}
                #{entry.entryNumber}
              </span>
              .
            </>
          ),
          confirmText: tCommon("delete"),
          variant: "destructive",
        })
      ) {
        deleteMutation.mutate(entry.id);
      }
    },
    [confirm, deleteMutation, tCommon, t],
  );

  const handlePost = useMemo(
    () => async (id: string) => {
      if (
        await confirm({
          title: t("post_journal_entry"),
          description: t("post_entry_desc"),
        })
      ) {
        postMutation.mutate(id);
      }
    },
    [confirm, postMutation, t],
  );

  const columns: Column<JournalEntryWithDetails>[] = useMemo(
    () => [
      {
        header: tCommon("date"),
        cell: (entry) => formatDate(entry.transactionDate),
      },
      {
        header: t("entry_number"),
        cell: (entry) => (
          <Link
            href={`/accounting/journal-entries/${entry.id}`}
            target="_blank"
            className="text-primary hover:underline font-medium"
          >
            {entry.entryNumber}
          </Link>
        ),
        className: "font-medium",
      },
      {
        header: t("description"),
        accessorKey: "description",
        className: "text-sm text-wrap whitespace-normal",
      },
      {
        header: t("created_by"),
        cell: (entry) => entry.user?.name || entry.user?.email || "System",
      },
      {
        header: t("amount"),
        cell: (entry) =>
          formatCurrency(
            entry.lines.reduce((acc, line) => {
              const amount =
                line.debitAmount instanceof Decimal
                  ? line.debitAmount.toNumber()
                  : Number(line.debitAmount || 0);
              return acc + amount;
            }, 0),
          ),
      },
      {
        header: tCommon("status"),
        cell: (entry) => <StatusBadge status={entry.status} />,
      },
      {
        header: tCommon("actions"),
        className: "text-right",
        headerClassName: "text-right",
        cell: (entry) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/accounting/journal-entries/${entry.id}`} target="_blank">
                  <Eye className="mr-2 h-4 w-4" />
                  {tCommon("details")}
                </Link>
              </DropdownMenuItem>
              {entry.status === "draft" && (
                <>
                  <Protect permission="journal_entries.edit">
                    <DropdownMenuItem asChild>
                      <Link
                        href={`/accounting/journal-entries/${entry.id}/edit`}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        {tCommon("edit")}
                      </Link>
                    </DropdownMenuItem>
                  </Protect>
                  <Protect permission="journal_entries.create">
                    <DropdownMenuItem onClick={() => handlePost(entry.id)}>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      {t("post_journal_entry")}
                    </DropdownMenuItem>
                  </Protect>
                  <Protect permission="journal_entries.delete">
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => handleDelete(entry)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {tCommon("delete")}
                    </DropdownMenuItem>
                  </Protect>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [formatDate, formatCurrency, handleDelete, handlePost, t, tCommon],
  );

  return (
    <PageListLayout>
      <PageListHeader>
        <PageListTitle title={t("journal")} />
        <PageListActions>
          <Protect permission="journal_entries.create">
            <Link href="/accounting/journal-entries/create">
              <Button>
                <Plus className="mr-2 h-4 w-4" /> {t("new_entry")}
              </Button>
            </Link>
          </Protect>
        </PageListActions>
      </PageListHeader>

      <PageListFilter>
        <div className="grid items-center gap-1.5 flex-1 min-w-[200px]">
          <CustomInput
            label={tCommon("search")}
            id="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("search_desc_entry")}
          />
        </div>
        <CustomInput
          label={tCommon("start_date")}
          type="date"
          id="startDate"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            setPage(1);
          }}
        />
        <CustomInput
          label={tCommon("end_date")}
          type="date"
          id="endDate"
          value={endDate}
          onChange={(e) => {
            setEndDate(e.target.value);
            setPage(1);
          }}
        />
        <CustomSelect
          label={tCommon("status")}
          value={status}
          onValueChange={(val) => {
            setStatus(val);
            setPage(1);
          }}
        >
          <SelectItem value="all">{t("all_status")}</SelectItem>
          <SelectItem value="draft">{t("draft")}</SelectItem>
          <SelectItem value="posted">{t("posted")}</SelectItem>
        </CustomSelect>
      </PageListFilter>

      <PageListContent>
        <DataTable
          data={entries}
          columns={columns}
          isLoading={isLoading}
          emptyMessage={t("no_journal_entries_found")}
          pagination={{
            totalEntries: total,
            pageSize: 20,
            currentPage: page,
            onPageChange: setPage,
          }}
        />
      </PageListContent>
    </PageListLayout>
  );
}
