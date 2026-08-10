"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CustomInput } from "@/components/ui/custom-input";
import { CustomSelect } from "@/components/ui/custom-select";
import { CustomTextarea } from "@/components/ui/custom-textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  createCashTransfer,
  updateCashTransfer,
  uploadTransferAttachment,
} from "../../actions";
import { CashAccount, CashTransfer, CashTransferFormData } from "../../types";
import { Loader2, Paperclip } from "lucide-react";
import { useToast, useFormatDate } from "@/hooks";
import { Label } from "@/components/ui/label";
import { AttachmentDialog } from "@/components/ui/attachment-dialog";
import { useEffect } from "react";
import { Prisma } from "@/prisma/generated/prisma/browser";
import { useAttachmentDialog } from "@/hooks/use-attachment-dialog";
import { SuperJSON } from "@/services/lib/superjson";

interface CashTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cashAccounts: CashAccount[];
  onSuccess: () => void;
  transfer?: CashTransfer;
  viewOnly?: boolean;
}

export function CashTransferDialog({
  open,
  onOpenChange,
  cashAccounts,
  onSuccess,
  transfer,
  viewOnly,
}: CashTransferDialogProps) {
  const { toast } = useToast();
  const t = useTranslations("CashBank");
  const tCommon = useTranslations("Common");
  const [formData, setFormData] = useState<CashTransferFormData>({
    fromAccountId: "",
    toAccountId: "",
    amount: new Prisma.Decimal(0),
    date: new Date(),
    reference: "",
    description: "",
    attachmentIds: [],
  });
  const attachmentDialog = useAttachmentDialog();
  const [isPending, startTransition] = useTransition();

  const { setAttachments } = attachmentDialog;

  useEffect(() => {
    if (transfer && open) {
      // Defer state update to the next tick to avoid cascading renders
      queueMicrotask(() => {
        setFormData({
          fromAccountId: transfer.fromAccountId,
          toAccountId: transfer.toAccountId,
          amount: new Prisma.Decimal(transfer.amount),
          date: new Date(transfer.date),
          reference: transfer.reference || "",
          description: transfer.description || "",
          attachmentIds: [],
        });

        if (transfer.journalEntry?.attachments) {
          setAttachments(
            transfer.journalEntry.attachments.map((a: any) => ({
              id: a.id,
              url: a.url,
              name: a.name,
              size: a.size,
              type: a.type,
            })),
          );
        } else {
          setAttachments([]);
        }
      });
    } else if (!transfer && open) {
      queueMicrotask(() => {
        setFormData({
          fromAccountId: "",
          toAccountId: "",
          amount: new Prisma.Decimal(0),
          date: new Date(),
          reference: "",
          description: "",
          attachmentIds: [],
        });
        setAttachments([]);
      });
    }
  }, [transfer, open, setAttachments]);

  const handleSubmit = () => {
    if (
      !formData.fromAccountId ||
      !formData.toAccountId ||
      formData.amount.lessThan(0)
    ) {
      toast({
        title: tCommon("error"),
        description: t("select_accounts_valid_amount"),
        variant: "destructive",
      });
      return;
    }

    if (formData.fromAccountId === formData.toAccountId) {
      toast({
        title: tCommon("error"),
        description: t("cannot_transfer_same_account"),
        variant: "destructive",
      });
      return;
    }

    startTransition(async () => {
      try {
        if (transfer) {
          await updateCashTransfer(transfer.id, {
            ...SuperJSON.serialize(formData),
            attachmentIds: attachmentDialog.attachments.map((a) => a.id),
          });
          toast({
            title: tCommon("success"),
            description: t("transfer_updated"),
          });
        } else {
          await createCashTransfer({
            ...SuperJSON.serialize(formData),
            attachmentIds: attachmentDialog.attachments.map((a) => a.id),
          });
          toast({
            title: tCommon("success"),
            description: t("transfer_recorded"),
          });
        }
        onSuccess();
        onOpenChange(false);
        if (!transfer) {
          setFormData({
            fromAccountId: "",
            toAccountId: "",
            amount: new Prisma.Decimal(0),
            date: new Date(),
            reference: "",
            description: "",
            attachmentIds: [],
          });
          attachmentDialog.setAttachments([]);
        }
      } catch (error) {
        toast({
          title: tCommon("error"),
          description:
            error instanceof Error ? error.message : t("something_went_wrong"),
          variant: "destructive",
        });
      }
    });
  };

  const accountOptions = cashAccounts.map((acc) => ({
    label: acc.name,
    value: acc.id,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {viewOnly ? t("view_transfer") : t("transfer_funds")}
          </DialogTitle>
          <DialogDescription>
            {viewOnly
              ? t("view_transfer_details")
              : t("record_transfer_between_accounts")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <CustomSelect
              label={t("from_account")}
              value={formData.fromAccountId}
              onValueChange={(val) =>
                setFormData({ ...formData, fromAccountId: val })
              }
              options={accountOptions}
              placeholder={t("select_source")}
              disabled={viewOnly}
            />
            <CustomSelect
              label={t("to_account")}
              value={formData.toAccountId}
              onValueChange={(val) =>
                setFormData({ ...formData, toAccountId: val })
              }
              options={accountOptions}
              placeholder={t("select_destination")}
              disabled={viewOnly}
            />
          </div>

          <div className="space-y-1">
            <Label>{t("amount")}</Label>
            <CurrencyInput
              value={formData.amount.toNumber()}
              onChange={(val) =>
                setFormData({
                  ...formData,
                  amount: new Prisma.Decimal(val || 0),
                })
              }
              placeholder={t("zero_placeholder")}
              disabled={viewOnly}
            />
          </div>

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
            disabled={viewOnly}
          />

          <CustomInput
            label={t("reference")}
            value={formData.reference || ""}
            onChange={(e) =>
              setFormData({ ...formData, reference: e.target.value })
            }
            placeholder={t("e_g_trf_001")}
            disabled={viewOnly}
          />

          <CustomTextarea
            label={t("description")}
            value={formData.description || ""}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            disabled={viewOnly}
          />

          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={attachmentDialog.openDialog}
              disabled={viewOnly && attachmentDialog.attachments.length === 0}
            >
              <Paperclip className="mr-2 h-4 w-4" />
              {attachmentDialog.attachments.length > 0
                ? `${attachmentDialog.attachments.length} ${attachmentDialog.attachments.length > 1 ? t("attachments") : t("attachment")}`
                : t("add_attachments")}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {viewOnly ? tCommon("close") : tCommon("cancel")}
          </Button>
          {!viewOnly && (
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("transfer")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <AttachmentDialog
        {...attachmentDialog.dialogProps}
        uploadAction={uploadTransferAttachment}
      />
    </Dialog>
  );
}
