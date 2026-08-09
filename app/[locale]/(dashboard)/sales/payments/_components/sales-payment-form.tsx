"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CustomInput } from "@/components/ui/custom-input";
import { CustomSelect } from "@/components/ui/custom-select";
import { CustomTextarea } from "@/components/ui/custom-textarea";
import { SelectItem } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  getUnpaidSalesInvoices,
  getCashAccounts,
  createSalesPayment,
  updateSalesPayment,
} from "../actions";
import { SuperJSON } from "@/lib/superjson";
import { format } from "date-fns";
import { Loader2, Paperclip } from "lucide-react";
import {
  PageFormActions,
  PageFormContent,
  PageFormHeader,
  PageFormLayout,
  PageFormTitle,
} from "@/components/layout/page/form-layout";
import { useTranslations } from "next-intl";
import {
  SalesInvoice,
  Contact,
  CashAccount,
} from "@/prisma/generated/prisma/client";
import { SalesPaymentInput, SalesPaymentWithDetails } from "../types";
import { AttachmentDialog, Attachment } from "@/components/ui/attachment-dialog";
import { uploadFile } from "@/app/[locale]/(dashboard)/general/files/actions";
import { useFormatDate, useFormatCurrency } from "@/hooks";

import { Department, Project } from "@/prisma/generated/prisma/client";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SuperJSONResult } from "superjson";
import { StatusHistoryDialog } from "@/components/ui/status-history-dialog";
import { CollapsibleSection } from "@/components/ui/collapsible-section";

interface SalesPaymentFormProps {
  initialData?: SalesPaymentWithDetails;
  readonly?: boolean;
  departments?: Department[];
  projects?: Project[];
}

export function SalesPaymentForm({
  initialData,
  readonly = false,
  departments = [],
  projects = [],
}: SalesPaymentFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const t = useTranslations("Sales");
  const tCommon = useTranslations("Common");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formatDate = useFormatDate();
  const formatCurrency = useFormatCurrency();

  const [formData, setFormData] = useState<SalesPaymentInput>({
    paymentNumber: initialData?.paymentNumber || "",
    contactId: initialData?.contactId || "",
    salesInvoiceId: initialData?.salesInvoiceId || "",
    paymentDate: initialData?.paymentDate
      ? new Date(initialData.paymentDate)
      : new Date(),
    amount: initialData ? Number(initialData.amount) : 0,
    reference: initialData?.reference || "",
    notes: initialData?.notes || "",
    cashAccountId: initialData?.cashAccountId || "",
    method: initialData?.method || "",
    departmentId: initialData?.departmentId || null,
    projectId: initialData?.projectId || null,
    attachmentIds: initialData?.attachments?.map((a) => a.id) || [],
  });

  // Date string for input
  const [dateStr, setDateStr] = useState(
    format(
      initialData?.paymentDate ? new Date(initialData.paymentDate) : new Date(),
      "yyyy-MM-dd",
    )
  );
  const [attachments, setAttachments] = useState<Attachment[]>(
    initialData?.attachments?.map((a) => ({
      id: a.id,
      name: a.name,
      url: a.url,
    })) || []
  );
  const [attachmentDialogOpen, setAttachmentDialogOpen] = useState(false);

  const { data: invoicesData, isLoading: isLoadingInvoices } = useQuery({
    queryKey: ["unpaid-sales-invoices"],
    queryFn: async () => {
      const data = await getUnpaidSalesInvoices();
      return SuperJSON.deserialize<
        (SalesInvoice & { contact: Contact; payments: any[] })[]
      >(data as SuperJSONResult);
    },
    enabled: !readonly,
  });

  const { data: cashAccountsData, isLoading: isLoadingAccounts } = useQuery({
    queryKey: ["cash-accounts"],
    queryFn: async () => {
      const data = await getCashAccounts();
      return SuperJSON.deserialize<CashAccount[]>(data as SuperJSONResult);
    },
    enabled: !readonly,
  });

  useEffect(() => {
    if (!initialData && formData.salesInvoiceId && invoicesData) {
      const invoice = invoicesData.find(
        (inv) => inv.id === formData.salesInvoiceId
      );
      if (invoice) {
        const totalPaid = invoice.payments.reduce(
          (sum: number, p: any) => sum + Number(p.amount),
          0
        );
        const remaining = Number(invoice.totalAmount) - totalPaid;

        setFormData((prev) => ({
          ...prev,
          amount: remaining,
          contactId: invoice.contactId,
          // paymentNumber will be generated on server if empty
        }));
      }
    }
  }, [formData.salesInvoiceId, invoicesData, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readonly) return;

    try {
      setIsSubmitting(true);
      const payload = {
        ...formData,
        paymentDate: new Date(dateStr),
        attachmentIds: attachments.map((a) => a.id),
      };

      let result;
      if (initialData) {
        result = await updateSalesPayment(initialData.id, payload);
      } else {
        result = await createSalesPayment(payload);
      }

      if (result.success) {
        toast({
          title: "Success",
          description: initialData
            ? "Payment updated successfully"
            : "Payment created successfully",
        });
        router.push("/sales/payments");
        router.refresh();
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.error,
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Something went wrong",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if ((isLoadingInvoices || isLoadingAccounts) && !readonly) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  // Filter invoices if editing, to include the current invoice even if paid
  // But for now, let's assume if editing, we just show the current invoice info or allow changing if logic permits.
  // Ideally, changing invoice on an existing payment is complex. 
  // For simplicity, let's allow selecting from unpaid invoices or the current one.

  return (
    <PageFormLayout>
      <form onSubmit={handleSubmit}>
        <PageFormHeader>
          <div className="flex items-center gap-2">
            <PageFormTitle
              title={
                initialData
                  ? readonly
                    ? t("view_payment")
                    : t("edit_payment")
                  : t("new_payment")
              }
            />
            {initialData && (
              <StatusHistoryDialog
                events={[
                  {
                    event: "Created",
                    at: initialData.createdAt,
                    byName: initialData.createdBy?.name,
                  },
                  {
                    event: "Last Updated",
                    at: initialData.updatedAt,
                    byName: initialData.updatedBy?.name,
                  },
                  {
                    event: "Posted",
                    at: initialData.postedAt,
                    byName: initialData.postedBy?.name,
                  },
                ]}
              />
            )}
          </div>
          <PageFormActions>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              {readonly ? tCommon("back") : tCommon("cancel")}
            </Button>
            {initialData ? (
              <Button asChild type="button" variant="outline">
                <Link
                  href={`/admin/integrations/outbox?search=${encodeURIComponent(initialData.id)}`}
                >
                  Outbox
                </Link>
              </Button>
            ) : null}
            {!readonly && (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {initialData ? t("update_payment") : t("save_payment")}
              </Button>
            )}
          </PageFormActions>
        </PageFormHeader>
        <PageFormContent className="grid gap-4 mt-4 p-0 bg-transparent border-none shadow-none">
          <CollapsibleSection
            title={t("overview") || "Overview"}
            collapsedContent={
              <div className="flex flex-wrap gap-4 text-sm">
                <span><strong>{t("payment_number")}:</strong> {formData.paymentNumber || "-"}</span>
                <span><strong>{t("invoice")}:</strong> {initialData?.salesInvoice?.invoiceNumber || invoicesData?.find(inv => inv.id === formData.salesInvoiceId)?.invoiceNumber || "-"}</span>
                <span><strong>{t("payment_date")}:</strong> {dateStr ? new Date(dateStr).toLocaleDateString("id-ID") : "-"}</span>
              </div>
            }
          >
            <div className="grid grid-cols-2 gap-4">
              <CustomSelect
                label={t("invoice")}
                value={formData.salesInvoiceId}
                onValueChange={(val) =>
                  setFormData((prev) => ({ ...prev, salesInvoiceId: val }))
                }
                placeholder={t("placeholder_select_invoice")}
                disabled={readonly || !!initialData}
              >
                {initialData && readonly && initialData.salesInvoice ? (
                  <SelectItem value={initialData.salesInvoice.id}>
                    {initialData.salesInvoice.invoiceNumber} - {initialData.contact?.name}
                  </SelectItem>
                ) : (
                  invoicesData?.map((invoice) => {
                    const totalPaid = invoice.payments.reduce(
                      (sum: number, p: any) => sum + Number(p.amount),
                      0
                    );
                    const remaining = Number(invoice.totalAmount) - totalPaid;
                    return (
                      <SelectItem key={invoice.id} value={invoice.id}>
                        {invoice.invoiceNumber} - {invoice.contact.name} (Due:{" "}
                        {formatCurrency(remaining)})
                      </SelectItem>
                    );
                  })
                )}
              </CustomSelect>

              <CustomInput
                label={t("payment_number")}
                value={formData.paymentNumber}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, paymentNumber: e.target.value }))
                }
                placeholder={t("placeholder_auto_generate")}
                disabled={readonly || !!initialData}
              />

              <CustomInput
                label={t("payment_date")}
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                disabled={readonly}
                required
              />

              <CustomSelect
                label={t("payment_method")}
                value={formData.method || ""}
                onValueChange={(val) =>
                  setFormData((prev) => ({ ...prev, method: val }))
                }
                placeholder={t("placeholder_select_method")}
                disabled={readonly}
              >
                <SelectItem value="CASH">{t("method_cash")}</SelectItem>
                <SelectItem value="BANK_TRANSFER">{t("method_bank_transfer")}</SelectItem>
                <SelectItem value="CHECK">{t("method_check")}</SelectItem>
                <SelectItem value="OTHER">{t("method_other")}</SelectItem>
              </CustomSelect>

              <CustomSelect
                label={t("deposit_to")}
                value={formData.cashAccountId}
                onValueChange={(val) =>
                  setFormData((prev) => ({ ...prev, cashAccountId: val }))
                }
                placeholder={t("placeholder_select_account")}
                disabled={readonly}
              >
                {readonly && initialData?.cashAccount ? (
                  <SelectItem value={initialData.cashAccount.id}>{initialData.cashAccount.name}</SelectItem>
                ) : (
                  cashAccountsData?.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} ({account.accountNumber})
                    </SelectItem>
                  ))
                )}
              </CustomSelect>

              <CustomInput
                label={t("amount")}
                type="number"
                value={formData.amount}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, amount: Number(e.target.value) }))
                }
                placeholder="0.00"
                disabled={readonly}
                min={0}
                step={0.01}
              />

              <CustomInput
                label={t("reference")}
                value={formData.reference || ""}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, reference: e.target.value }))
                }
                placeholder={t("placeholder_reference")}
                disabled={readonly}
              />

              <div className="space-y-2">
                <label className="text-sm font-medium">{t("department")}</label>
                <SearchableSelect
                  value={formData.departmentId || ""}
                  onValueChange={(val) =>
                    setFormData((prev) => ({ ...prev, departmentId: val || null }))
                  }
                  options={departments.map((d) => ({
                    value: d.id,
                    label: d.name,
                  }))}
                  placeholder={t("placeholder_select_department")}
                  disabled={readonly}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("project")}</label>
                <SearchableSelect
                  value={formData.projectId || ""}
                  onValueChange={(val) =>
                    setFormData((prev) => ({ ...prev, projectId: val || null }))
                  }
                  options={projects.map((p) => ({
                    value: p.id,
                    label: p.name,
                  }))}
                  placeholder={t("placeholder_select_project")}
                  disabled={readonly}
                />
              </div>

              <div className="col-span-2">
                <CustomTextarea
                  label={t("notes")}
                  value={formData.notes || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder={t("placeholder_notes")}
                  disabled={readonly}
                />
              </div>

              <div className="col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">{tCommon("attachments")}</label>
                  {!readonly && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAttachmentDialogOpen(true)}
                    >
                      <Paperclip className="mr-2 h-4 w-4" />
                      {tCommon("add_files")}
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {attachments.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-2 rounded-md border bg-muted px-3 py-1 text-sm"
                    >
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {file.name}
                      </a>
                      {!readonly && (
                        <button
                          type="button"
                          onClick={() =>
                            setAttachments((prev) =>
                              prev.filter((a) => a.id !== file.id)
                            )
                          }
                          className="ml-2 text-muted-foreground hover:text-foreground"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {attachments.length === 0 && (
                    <span className="text-sm text-muted-foreground">
                      {tCommon("no_attachments")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </CollapsibleSection>
        </PageFormContent>
      </form>

      <AttachmentDialog
        open={attachmentDialogOpen}
        onOpenChange={setAttachmentDialogOpen}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        uploadAction={async (formData) => {
          const res = await uploadFile(formData);
          return res;
        }}
      />
    </PageFormLayout>
  );
}
