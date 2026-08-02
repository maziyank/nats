"use client";

import { Button } from "@/components/ui/button";
import { DataTable, Column } from "@/components/ui/data-table";
import { TableFooter, TableRow, TableCell } from "@/components/ui/table";
import Link from "next/link";
import { Pencil, Paperclip, ArrowLeft, PrinterIcon, Building2, FolderKanban, User } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/ui/status-badge";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import { useFormatDate } from "@/hooks/use-format-date";
import { useRouter } from "next/navigation";
import { Decimal } from "decimal.js";
import { JournalEntryWithDetails } from "../../types";
import { useState } from "react";
import { ReportPreviewDialog } from "@/app/[locale]/(dashboard)/reporting/_components/report-preview-dialog";

import { useTranslations } from "next-intl";

export function JournalEntryDetails({
  entry,
}: {
  entry: JournalEntryWithDetails;
}) {
  const t = useTranslations("Accounting");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const formatCurrency = useFormatCurrency();
  const formatDate = useFormatDate();
  const [isReportPreviewOpen, setIsReportPreviewOpen] = useState(false);

  const totalDebit = entry?.lines.reduce(
    (sum: number, line: any) =>
      sum +
      (line.debitAmount instanceof Decimal
        ? line.debitAmount.toNumber()
        : Number(line.debitAmount || 0)),
    0,
  );
  const totalCredit = entry?.lines.reduce(
    (sum: number, line: any) =>
      sum +
      (line.creditAmount instanceof Decimal
        ? line.creditAmount.toNumber()
        : Number(line.creditAmount || 0)),
    0,
  );

  const columns: Column<any>[] = [
    {
      header: t("account_code"),
      accessorKey: "account",
      cell: (line) => line.account.code,
    },
    {
      header: t("account_name"),
      accessorKey: "account",
      cell: (line) => line.account.name,
    },
    {
      header: t("description"),
      accessorKey: "description",
      cell: (line) => line.description || "-",
    },
    {
      header: "",
      accessorKey: "department",
      className: "w-20",
      cell: (line) => {
        const hasAny = line.department || line.project || line.contact;
        if (!hasAny) return null;
        return (
          <div className="flex items-center gap-1">
            {line.department && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center justify-center rounded bg-muted p-1 cursor-default">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>{line.department.name}</TooltipContent>
              </Tooltip>
            )}
            {line.project && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center justify-center rounded bg-muted p-1 cursor-default">
                    <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>{line.project.name}</TooltipContent>
              </Tooltip>
            )}
            {line.contact && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    target="_blank"
                    href={`/general/contacts/${line.contact.id}`}
                    className="inline-flex items-center justify-center rounded bg-muted p-1 hover:bg-muted/80"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>{line.contact.name}</TooltipContent>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      header: tCommon("debit") || "Debit",
      headerClassName: "text-right",
      className: "text-right",
      cell: (line) => {
        const amount =
          line.debitAmount instanceof Decimal
            ? line.debitAmount.toNumber()
            : Number(line.debitAmount || 0);
        return amount > 0 ? formatCurrency(amount) : "-";
      },
    },
    {
      header: tCommon("credit") || "Credit",
      headerClassName: "text-right",
      className: "text-right",
      cell: (line) => {
        const amount =
          line.creditAmount instanceof Decimal
            ? line.creditAmount.toNumber()
            : Number(line.creditAmount || 0);
        return amount > 0 ? formatCurrency(amount) : "-";
      },
    },
  ];

  return (
    entry && (
      <div className="flex flex-1 flex-col gap-2 p-4 pt-0 w-full">
        <div className="flex items-center">
          <div className="flex items-center gap-4 justify-between w-full">
            <div className="flex flex-col">
              <h2 className="text-lg font-bold tracking-tight">
                {t("journal_entry")}
              </h2>
              <div className="flex items-center text-sm gap-2 text-muted-foreground mt-1">
                <span>{entry.entryNumber}</span>
                <span>•</span>
                <span>
                  {formatDate(entry.transactionDate)}
                </span>
                <span>•</span>
                <StatusBadge status={entry.status} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsReportPreviewOpen(true)}
              >
                <PrinterIcon className="mr-2 h-4 w-4" />
                {tCommon("print") || "Print"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {tCommon("back")}
              </Button>
            </div>
          </div>
          {entry.status === "draft" && (
            <Link href={`/accounting/journal-entries/${entry.id}/edit`} target="_blank">
              <Button className="ml-2">
                <Pencil className="mr-2 h-4 w-4" /> {tCommon("edit")}
              </Button>
            </Link>
          )}
        </div>

        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6 space-y-6">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">
              {t("description")}
            </h3>
            <p className="mt-1 text-lg">{entry.description || "-"}</p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              {t("lines")}
            </h3>
            <div className="rounded-md border">
              <DataTable
                data={entry.lines}
                columns={columns}
                footer={
                  <TableFooter>
                    <TableRow className="font-bold bg-muted/50">
                      <TableCell colSpan={4} className="text-right">
                        {tCommon("total")}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(Number(totalDebit))}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(Number(totalCredit))}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                }
              />
            </div>
          </div>

          {entry.notes && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                {t("notes")}
              </h3>
              <div className="rounded-md border p-4 bg-muted/30">
                <p className="whitespace-pre-wrap text-sm">{entry.notes}</p>
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              {t("attachments")}
            </h3>
            {entry.attachments && entry.attachments.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {entry.attachments.map((file: any) => (
                  <a
                    key={file.id}
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm hover:bg-muted/80"
                  >
                    <Paperclip className="h-4 w-4" />
                    {file.name}
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("no_attachments")}</p>
            )}
          </div>

          <div className="text-sm text-muted-foreground">
            <p>
              {t("created_by")} {entry.user?.name || entry.user?.email || "System"} {t("on")}{" "}
              {formatDate(entry.createdAt, { includeTime: true })}
            </p>
            {entry.status === "posted" && entry.postedAt && (
              <p>{t("posted_on")} {formatDate(entry.postedAt, { includeTime: true })}</p>
            )}
          </div>
        </div>
        <ReportPreviewDialog
          isOpen={isReportPreviewOpen}
          onOpenChange={setIsReportPreviewOpen}
          code="JOURNAL_ENTRY"
          input={{ entryId: entry.id }}
          title={`${t("journal_entry")} #${entry.entryNumber}`}
        />
      </div>
    )
  );
}
