"use client";
export const dynamic = "force-dynamic";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Paperclip,
  FileIcon,
  MoreHorizontal,
  Check,
  Edit,
  Trash2,
  Eye,
  ArrowRightIcon,
} from "lucide-react";
import { CashTransferDialog } from "./_components/transfer-dialog";
import { CashTransfer } from "../types";
import { DataTable, Column } from "@/components/ui/data-table";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { TransferStatus } from "@/prisma/generated/prisma/enums";
import {
  approveCashTransfer,
  deleteCashTransfer,
  getTransfers,
  getCashAccounts,
} from "../actions";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageListActions,
  PageListContent,
  PageListHeader,
  PageListLayout,
  PageListTitle,
  PageListFilter,
} from "@/components/layout/page/list-layout";
import { useFormatCurrency, useFormatDate } from "@/hooks";
import { SuperJSON } from "@/services/lib/superjson";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TransferFilters } from "./_components/transfer-filters";

import { useTranslations } from "next-intl";

export default function TransferPage() {
  const t = useTranslations("CashBank");
  const tCommon = useTranslations("Common");
  const tSales = useTranslations("Sales");
  const searchParams = useSearchParams();
  const search = searchParams.get("search") || "";
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<
    CashTransfer | undefined
  >(undefined);
  const [isViewMode, setIsViewMode] = useState(false);
  const { toast } = useToast();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const formatDate = useFormatDate();

  const { data: transfers = [] } = useQuery({
    queryKey: ["cash-transfers", search],
    queryFn: async () => {
      const serialized = await getTransfers(search);
      return SuperJSON.deserialize<CashTransfer[]>(serialized);
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["cash-accounts"],
    queryFn: () => getCashAccounts(),
  });

  const handleEdit = (transfer: CashTransfer) => {
    setEditingTransfer(transfer);
    setIsViewMode(false);
    setIsTransferOpen(true);
  };

  const handleView = (transfer: CashTransfer) => {
    setEditingTransfer(transfer);
    setIsViewMode(true);
    setIsTransferOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (
      await confirm({
        title: t("delete_transfer"),
        description: t("delete_transfer_desc"),
      })
    ) {
      startTransition(async () => {
        try {
          await deleteCashTransfer(id);
          queryClient.invalidateQueries({ queryKey: ["cash-transfers"] });
          toast({
            title: tCommon("success"),
            description: t("transfer_deleted"),
          });
        } catch (error) {
          toast({
            title: tCommon("error"),
            description:
              error instanceof Error ? error.message : t("failed_to_delete"),
            variant: "destructive",
          });
        }
      });
    }
  };

  const handleApprove = async (id: string) => {
    if (
      await confirm({
        title: t("approve_transfer"),
        description: t("approve_transfer_desc"),
      })
    ) {
      startTransition(async () => {
        try {
          const result = await approveCashTransfer(id);
          if (!result.success) {
            throw new Error(result.error || t("failed_to_approve"));
          }
          queryClient.invalidateQueries({ queryKey: ["cash-transfers"] });
          toast({
            title: tCommon("success"),
            description: result.data?.processed ? (
              t("transfer_approved")
            ) : (
              <span>
                {result.data?.alreadyQueued
                  ? tSales("already_queued")
                  : tSales("queued_for_processing")}{" "}
                {result.data?.outboxId ? (
                  <Link
                    href={`/admin/integrations/outbox?search=${encodeURIComponent(
                      result.data.outboxId,
                    )}`}
                    className="underline"
                  >
                    {tSales("view_outbox")}
                  </Link>
                ) : null}
              </span>
            ),
          });
        } catch (error) {
          toast({
            title: tCommon("error"),
            description:
              error instanceof Error ? error.message : "Failed to approve",
            variant: "destructive",
          });
        }
      });
    }
  };

  const columns: Column<CashTransfer>[] = [
    {
      header: tCommon("date"),
      cell: (transfer) => formatDate(transfer.date),
    },
    {
      header: t("reference"),
      cell: (transfer) => transfer.reference || "-",
    },
    {
      header: `${t("from")} - ${t("to")}`,
      cell: (transfer) =>
      (
        <div className="flex items-center">
          <Link href={`/accounting/ledger/${transfer.fromAccountId}`} target="_blank">
            <span className="font-medium text-primary">{transfer.fromAccount.name}</span>
          </Link>
          <ArrowRightIcon className="h-4 w-4 mx-2" />
          <Link href={`/accounting/ledger/${transfer.toAccountId}`} target="_blank">
            <span className="font-medium text-primary">{transfer.toAccount.name}</span>
          </Link></div>
      ),
    },
    {
      header: tCommon("description"),
      cell: (transfer) => (
        <div className="flex flex-col">
          <span>{transfer.description}</span>
          {transfer.journalEntry?.attachments &&
            transfer.journalEntry.attachments.length > 0 && (
              <div className="mt-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Paperclip className="h-3 w-3" />
                      {transfer.journalEntry.attachments.length} {t("attachments")}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>{t("attachments")}</DropdownMenuLabel>
                    {transfer.journalEntry.attachments.map((file: any) => (
                      <DropdownMenuItem key={file.id} asChild>
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex cursor-pointer items-center gap-2"
                        >
                          <FileIcon className="h-4 w-4" />
                          <span className="max-w-[200px] truncate">
                            {file.name}
                          </span>
                        </a>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
        </div>
      ),
    },
    {
      header: tCommon("amount"),
      className: "font-medium",
      cell: (transfer) => formatCurrency(Number(transfer.amount)),
    },
    {
      header: tCommon("status"),
      cell: (transfer) => (
        <Badge
          variant={
            transfer.status === TransferStatus.APPROVED
              ? "default"
              : transfer.status === TransferStatus.REJECTED
                ? "destructive"
                : "secondary"
          }
        >
          {transfer.status}
        </Badge>
      ),
    },
    {
      header: "",
      className: "w-[50px]",
      cell: (transfer) => (
        <div className="flex items-center justify-end gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{tCommon("actions")}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handleView(transfer)}>
                <Eye className="mr-2 h-4 w-4" />
                {tCommon("view")}
              </DropdownMenuItem>
              {transfer.status === TransferStatus.PENDING && (
                <>
                  <DropdownMenuItem onClick={() => handleApprove(transfer.id)}>
                    <Check className="mr-2 h-4 w-4" />
                    {tSales("post")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleEdit(transfer)}>
                    <Edit className="mr-2 h-4 w-4" />
                    {tCommon("edit")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => handleDelete(transfer.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {tCommon("delete")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <PageListLayout>
      <PageListHeader>
        <PageListTitle title={t("transfer")} />
        <PageListActions>
          <Button
            onClick={() => {
              setEditingTransfer(undefined);
              setIsViewMode(false);
              setIsTransferOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("new_transfer")}
          </Button>
        </PageListActions>
      </PageListHeader>

      <PageListFilter>
        <TransferFilters />
      </PageListFilter>

      <PageListContent>
        <DataTable
          data={transfers}
          columns={columns}
          emptyMessage={t("no_recent_transactions")}
        />
      </PageListContent>

      <CashTransferDialog
        open={isTransferOpen}
        onOpenChange={(open) => {
          setIsTransferOpen(open);
          if (!open) {
            setEditingTransfer(undefined);
            setIsViewMode(false);
          }
        }}
        cashAccounts={accounts}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["cash-transfers"] });
          queryClient.invalidateQueries({
            queryKey: ["cash-bank", "dashboard-stats"],
          });
          setIsTransferOpen(false);
        }}
        transfer={editingTransfer}
        viewOnly={isViewMode}
      />
    </PageListLayout>
  );
}
