"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CustomInput } from "@/components/ui/custom-input";
import { CustomSelect } from "@/components/ui/custom-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Paperclip, Loader2, StickyNote } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CashTransactionType } from "@/prisma/generated/prisma/enums";
import { createCashTransaction, updateCashTransaction } from "../actions";
import {
  CashTransactionAllocationFormData,
  CashTransactionFormData,
} from "../types";
import { Account, CashAccount, Contact } from "@/prisma/generated/prisma/browser";
import { Department, Project } from "@/prisma/generated/prisma/client";
import { AttachmentDialog } from "@/components/ui/attachment-dialog";
import { NoteDialog } from "@/components/ui/note-dialog";
import { uploadFile } from "@/app/[locale]/(dashboard)/general/files/actions";
import { useFormatCurrency } from "@/hooks";
import { useAttachmentDialog } from "@/hooks/use-attachment-dialog";
import { useNoteDialog } from "@/hooks/use-note-dialog";
import { SuperJSON } from "@/lib/superjson";
import {
  PageFormActions,
  PageFormContent,
  PageFormHeader,
  PageFormLayout,
  PageFormTitle,
} from "@/components/layout/page/form-layout";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { format } from "date-fns";

interface TransactionFormProps {
  cashAccounts: CashAccount[];
  glAccounts: Account[];
  contacts: Contact[];
  departments?: Department[];
  projects?: Project[];
  onCancel?: () => void;
  initialData?: CashTransactionFormData & { id?: string };
  readOnly?: boolean;
}

export function TransactionForm({
  cashAccounts,
  glAccounts,
  contacts,
  departments,
  projects,
  onCancel,
  initialData,
  readOnly = false,
}: TransactionFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = useTranslations("CashBank");
  const tCommon = useTranslations("Common");

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.push("/cash-bank/transaction");
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const formatCurrency = useFormatCurrency();

  const attachmentDialog = useAttachmentDialog({
    initialAttachments: initialData?.attachments,
  });
  const noteDialog = useNoteDialog({ initialValue: initialData?.notes });

  const [formData, setFormData] = useState<CashTransactionFormData>(
    initialData
      ? {
        ...initialData,
        date: new Date(initialData.date), // Ensure date is Date object
        departmentId: initialData.departmentId,
        projectId: initialData.projectId,
      }
      : {
        date: new Date(),
        type: CashTransactionType.INCOME,
        cashAccountId: "",
        contactId: "",
        departmentId: undefined,
        projectId: undefined,
        allocations: [],
        attachments: [],
        notes: "",
        reference: "",
        description: "",
      },
  );

  const handleAddAllocation = () => {
    setFormData((prev) => ({
      ...prev,
      allocations: [
        ...prev.allocations,
        { accountId: "", amount: 0, description: "" },
      ],
    }));
  };

  const handleRemoveAllocation = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      allocations: prev.allocations.filter((_, i) => i !== index),
    }));
  };

  const updateAllocation = (
    index: number,
    field: keyof CashTransactionAllocationFormData,
    value: any,
  ) => {
    const newAllocations = [...formData.allocations];
    newAllocations[index] = { ...newAllocations[index], [field]: value };
    setFormData((prev) => ({ ...prev, allocations: newAllocations }));
  };

  const handleSubmit = async () => {
    try {
      if (!formData.cashAccountId) {
        toast({
          title: t("validation_error"),
          description: t("select_cash_account"),
          variant: "destructive",
        });
        return;
      }

      // Check if allocations have accountId and amount > 0
      for (const alloc of formData.allocations) {
        if (!alloc.accountId) {
          toast({
            title: t("validation_error"),
            description: t("all_allocations_account_selected"),
            variant: "destructive",
          });
          return;
        }
        if (Number(alloc.amount) <= 0) {
          toast({
            title: t("validation_error"),
            description: t("allocation_amount_greater_zero"),
            variant: "destructive",
          });
          return;
        }
      }

      setIsSubmitting(true);
      const submitData = {
        ...formData,
        attachments: attachmentDialog.attachments,
        notes: noteDialog.note,
      };

      if (initialData?.id) {
        await updateCashTransaction(
          initialData.id,
          SuperJSON.serialize(submitData),
        );
        toast({
          title: tCommon("success"),
          description: t("transaction_updated"),
        });
      } else {
        const result = await createCashTransaction(SuperJSON.serialize(submitData));
        if (!result.success) {
          throw new Error(result.error || t("failed_create_transaction"));
        }
        toast({
          title: tCommon("success"),
          description: result.data?.processed ? (
            t("transaction_created")
          ) : (
            <span>
              {t("transaction_queued_processing")}{" "}
              {result.data?.outboxId ? (
                <Link
                  href={`/admin/integrations/outbox?search=${encodeURIComponent(
                    result.data.outboxId,
                  )}`}
                  className="underline"
                >
                  {t("view_outbox")}
                </Link>
              ) : null}
            </span>
          ),
        });
      }

      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ["cash-transactions"] });
      await queryClient.invalidateQueries({
        queryKey: ["cash-bank", "dashboard-stats"],
      });

      router.push("/cash-bank/transaction");
    } catch (error) {
      console.error(error);
      toast({
        title: tCommon("error"),
        description: t("failed_create_transaction"),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalAmount = formData.allocations.reduce(
    (sum, a) => sum + Number(a.amount || 0),
    0,
  );

  const selectedCashAccount = cashAccounts.find(a => a.id === formData.cashAccountId);
  const selectedContact = contacts.find(c => c.id === formData.contactId);

  return (
    <PageFormLayout>
      <PageFormHeader>
        <PageFormTitle>
          {initialData?.id ? t("edit_cash_transaction") : t("new_cash_transaction")}
        </PageFormTitle>
        <PageFormActions>
          <Button variant="outline" onClick={handleCancel}>
            {readOnly ? tCommon("back") : tCommon("cancel")}
          </Button>
          {!readOnly && (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("save_transaction")}
            </Button>
          )}
        </PageFormActions>
      </PageFormHeader>

      <PageFormContent className="grid gap-4 mt-4 p-0 bg-transparent border-none shadow-none">
        <div className="space-y-4">
          <CollapsibleSection
            title={t("general_information") || "General Information"}
            collapsedContent={
              <div className="flex flex-wrap gap-4 text-sm">
                <span><strong>{t("type")}:</strong> {formData.type === CashTransactionType.INCOME ? t("revenue_in") : t("expense_out")}</span>
                <span><strong>{t("date")}:</strong> {formData.date ? format(new Date(formData.date), "dd MMM yyyy") : "-"}</span>
                <span><strong>{t("cash_bank_account")}:</strong> {selectedCashAccount?.name || "-"}</span>
                {selectedContact && <span><strong>{t("contact_optional")}:</strong> {selectedContact.name}</span>}
              </div>
            }
          >
            <div className="grid grid-cols-2 gap-4">
              <CustomSelect
                label={t("type")}
                value={formData.type}
                onValueChange={(val) =>
                  setFormData({ ...formData, type: val as CashTransactionType })
                }
                options={[
                  { label: t("revenue_in"), value: CashTransactionType.INCOME },
                  { label: t("expense_out"), value: CashTransactionType.EXPENSE },
                ]}
                disabled={readOnly}
              />
              <CustomInput
                label={t("date")}
                type="date"
                value={
                  formData.date instanceof Date
                    ? formData.date.toISOString().split("T")[0]
                    : formData.date
                }
                onChange={(e) =>
                  setFormData({ ...formData, date: new Date(e.target.value) })
                }
                disabled={readOnly}
              />
              <div className="space-y-1">
                <Label>{t("contact_optional")}</Label>
                <SearchableSelect
                  value={formData.contactId}
                  onValueChange={(val) =>
                    setFormData({ ...formData, contactId: val || undefined })
                  }
                  options={contacts.map((c) => ({
                    label: c.name,
                    value: c.id,
                    icon: (
                      <Avatar size="sm">
                        <AvatarFallback className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                          {c.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ),
                  }))}
                  placeholder={t("select_contact")}
                  disabled={readOnly}
                />
              </div>
              <CustomInput
                label={t("reference")}
                value={formData.reference || ""}
                onChange={(e) =>
                  setFormData({ ...formData, reference: e.target.value })
                }
                placeholder={t("optional_reference")}
                disabled={readOnly}
              />
              <CustomSelect
                label={t("cash_bank_account")}
                value={formData.cashAccountId}
                onValueChange={(val) =>
                  setFormData({ ...formData, cashAccountId: val })
                }
                options={cashAccounts.map((acc) => ({
                  label: acc.name,
                  value: acc.id,
                }))}
                placeholder={t("select_account")}
                disabled={readOnly}
              />

              <CustomInput
                label={t("description")}
                value={formData.description || ""}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder={t("transaction_description")}
                disabled={readOnly}
              />

              <div className="col-span-2 grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>{t("department")}</Label>
                  <SearchableSelect
                    value={formData.departmentId || ""}
                    onValueChange={(val) => setFormData({ ...formData, departmentId: val || undefined })}
                    options={departments?.map(d => ({ value: d.id, label: d.name })) || []}
                    placeholder={t("select_department")}
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("project")}</Label>
                  <SearchableSelect
                    value={formData.projectId || ""}
                    onValueChange={(val) => setFormData({ ...formData, projectId: val || undefined })}
                    options={projects?.map(p => ({ value: p.id, label: p.name })) || []}
                    placeholder={t("select_project")}
                    disabled={readOnly}
                  />
                </div>
              </div>

              <div className="col-span-2 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={attachmentDialog.openDialog}
                  disabled={readOnly}
                >
                  <Paperclip className="mr-2 h-4 w-4" />
                  {attachmentDialog.attachments.length > 0
                    ? `${attachmentDialog.attachments.length} ${attachmentDialog.attachments.length > 1 ? t("attachments") : t("attachment")}`
                    : t("attach_file")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={noteDialog.openDialog}
                  disabled={readOnly}
                >
                  <StickyNote className="mr-2 h-4 w-4" />
                  {noteDialog.note ? t("edit_note") : t("add_note")}
                </Button>
              </div>
            </div>
          </CollapsibleSection>

          {/* Allocations Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30%]">{t("description")}</TableHead>
                    <TableHead className="w-[40%]">{t("account")}</TableHead>
                    <TableHead className="w-[25%]">{t("amount")}</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {formData.allocations.map((alloc, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <CustomInput
                          value={alloc.description || ""}
                          onChange={(e) =>
                            updateAllocation(index, "description", e.target.value)
                          }
                          placeholder={t("line_description")}
                          disabled={readOnly}
                        />
                      </TableCell>
                      <TableCell>
                        <SearchableSelect
                          options={glAccounts.map((acc) => ({
                            label: `${acc.code} - ${acc.name}`,
                            value: acc.id,
                          }))}
                          value={alloc.accountId}
                          onValueChange={(val) =>
                            updateAllocation(index, "accountId", val)
                          }
                          placeholder={t("select_gl_account")}
                          disabled={readOnly}
                        />
                      </TableCell>
                      <TableCell>
                        <CurrencyInput
                          value={alloc.amount}
                          onChange={(val) => updateAllocation(index, "amount", val)}
                          className="text-right"
                          disabled={readOnly}
                        />
                      </TableCell>
                      <TableCell>
                        {!readOnly && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveAllocation(index)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {formData.allocations.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-muted-foreground h-24"
                      >
                        {readOnly
                          ? t("no_allocations_found")
                          : t("no_allocations_add_line")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
            <CardFooter className="justify-between border-t p-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddAllocation}
                disabled={readOnly}
              >
                <Plus className="mr-2 h-4 w-4" /> {t("add_line") || "Add Line"}
              </Button>
              <div className="flex items-center gap-2 text-md">
                <span>{t("total") || "Total"}:</span>
                <span>{formatCurrency(totalAmount)}</span>
              </div>
            </CardFooter>
          </Card>
        </div>
      </PageFormContent>

      <AttachmentDialog
        {...attachmentDialog.dialogProps}
        uploadAction={uploadFile}
      />

      <NoteDialog {...noteDialog.dialogProps} />
    </PageFormLayout>
  );
}
