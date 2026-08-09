"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CustomInput } from "@/components/ui/custom-input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Trash2, ArrowLeft, Paperclip, ArrowLeftSquare } from "lucide-react";
import { createSalesReturn, updateSalesReturn } from "../actions";
import { SalesReturnInput, SalesReturnWithDetails } from "../types";
import { CustomSelect } from "@/components/ui/custom-select";
import { useToast } from "@/hooks/use-toast";
import { CustomTextarea } from "@/components/ui/custom-textarea";
import { SortableTableRow } from "@/components/ui/sortable-row";
import { generateId } from "@/lib/utils";
import { SuperJSON } from "@/lib/superjson";
import { SuperJSONResult } from "superjson";
import { SalesOrderWithDetails } from "../../orders/types";
import { SalesInvoiceWithDetails } from "../../invoices/types";
import {
  AttachmentDialog,
  Attachment,
} from "@/components/ui/attachment-dialog";
import { uploadFile } from "@/app/[locale]/(dashboard)/general/files/actions";
import { Department, Project } from "@/prisma/generated/prisma/client";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import {
  PageFormActions,
  PageFormContent,
  PageFormHeader,
  PageFormLayout,
  PageFormTitle,
} from "@/components/layout/page/form-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusHistoryDialog } from "@/components/ui/status-history-dialog";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { useTranslations } from "next-intl";

interface SalesReturnFormProps {
  returnItem?: SuperJSONResult;
  customers: { id: string; name: string }[];
  salesOrders: SuperJSONResult | any[];
  salesInvoices: SuperJSONResult | any[];
  departments?: Department[];
  projects?: Project[];
  readonly?: boolean;
}

export function SalesReturnForm({
  returnItem: serializedReturnItem,
  customers,
  salesOrders: serializedSalesOrders,
  salesInvoices: serializedSalesInvoices,
  departments = [],
  projects = [],
  readonly = false,
}: SalesReturnFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const formatCurrency = useFormatCurrency();
  const t = useTranslations("Sales");
  const tCommon = useTranslations("Common");

  const returnItem = serializedReturnItem
    ? SuperJSON.deserialize<SalesReturnWithDetails>(serializedReturnItem)
    : undefined;

  const [attachments, setAttachments] = useState<Attachment[]>(
    returnItem?.attachments?.map((a) => ({
      id: a.id,
      name: a.name,
      url: a.url,
    })) || [],
  );
  const [isAttachmentDialogOpen, setIsAttachmentDialogOpen] = useState(false);

  const salesOrders = useMemo(
    () =>
      Array.isArray(serializedSalesOrders)
        ? []
        : SuperJSON.deserialize<SalesOrderWithDetails[]>(
            serializedSalesOrders as SuperJSONResult,
          ),
    [serializedSalesOrders],
  );
  const salesInvoices = useMemo(
    () =>
      Array.isArray(serializedSalesInvoices)
        ? []
        : SuperJSON.deserialize<SalesInvoiceWithDetails[]>(
            serializedSalesInvoices as SuperJSONResult,
          ),
    [serializedSalesInvoices],
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const [formData, setFormData] = useState<
    Omit<SalesReturnInput, "items"> & {
      items: (SalesReturnInput["items"][0] & { id: string })[];
    }
  >({
    returnNumber: returnItem?.returnNumber || "",
    contactId: returnItem?.contactId || "",
    salesOrderId: returnItem?.salesOrderId || undefined,
    salesInvoiceId: returnItem?.salesInvoiceId || undefined,
    departmentId: returnItem?.departmentId || null,
    projectId: returnItem?.projectId || null,
    returnDate: returnItem?.returnDate
      ? new Date(returnItem.returnDate)
      : new Date(),
    notes: returnItem?.notes || "",
    status: returnItem?.status || "DRAFT",
    items:
      returnItem?.items.map((item) => ({
        id: generateId(),
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
      })) || [],
  });

  const filteredSalesOrders = useMemo(() => {
    if (formData.contactId) {
      return salesOrders.filter((so) => so.contactId === formData.contactId);
    }
    return [];
  }, [formData.contactId, salesOrders]);

  const filteredSalesInvoices = useMemo(() => {
    if (formData.contactId) {
      return salesInvoices.filter((si) => si.contactId === formData.contactId);
    }
    return [];
  }, [formData.contactId, salesInvoices]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setFormData((prev) => {
        const oldIndex = prev.items.findIndex((item) => item.id === active.id);
        const newIndex = prev.items.findIndex((item) => item.id === over.id);
        return {
          ...prev,
          items: arrayMove(prev.items, oldIndex, newIndex),
        };
      });
    }
  };

  const handleContactChange = (contactId: string) => {
    setFormData((prev) => ({
      ...prev,
      contactId,
      salesOrderId: undefined,
      salesInvoiceId: undefined,
      items: [], // Clear items on customer change
    }));
  };

  const handleSalesOrderChange = (soId: string) => {
    const so = salesOrders.find((s) => s.id === soId);
    setFormData((prev) => ({
      ...prev,
      salesOrderId: soId,
      departmentId: so?.departmentId || prev.departmentId,
      projectId: so?.projectId || prev.projectId,
      items: so
        ? so.items.map((item) => ({
            id: generateId(),
            productId: item.productId,
            quantity: 0,
            unitPrice: Number(item.unitPrice),
          }))
        : [],
    }));
  };

  const handleItemChange = (
    index: number,
    field: keyof SalesReturnInput["items"][0],
    value: number,
  ) => {
    setFormData((prev) => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prev, items: newItems };
    });
  };

  const handleRemoveItem = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const calculateTotal = () => {
    return formData.items.reduce(
      (acc, item) => acc + item.quantity * item.unitPrice,
      0,
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const submissionData = {
      ...formData,
      items: formData.items.map(({ id, ...rest }) => rest),
      attachmentIds: attachments.map((a) => a.id),
    };

    try {
      if (returnItem) {
        const result = await updateSalesReturn(returnItem.id, submissionData);
        if (!result.success) throw new Error(result.error);
        toast({
          title: "Success",
          description: "Sales return updated successfully",
        });
      } else {
        const result = await createSalesReturn(submissionData);
        if (!result.success) throw new Error(result.error);
        toast({
          title: "Success",
          description: "Sales return created successfully",
        });
      }
      router.push("/sales/returns");
    } catch (error) {
      toast({
        title: "Error",
        description: (error as Error).message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getProductName = (productId: string) => {
    const so = salesOrders.find((s) => s.id === formData.salesOrderId);
    if (so) {
      const item = so.items.find((i) => i.productId === productId);
      if (item) return item.product.name;
    }
    if (returnItem) {
      const item = returnItem.items.find((i) => i.productId === productId);
      if (item) return item.product.name;
    }
    return "Unknown Product";
  };

  const getProductUnit = (productId: string) => {
    const so = salesOrders.find((s) => s.id === formData.salesOrderId);
    if (so) {
      const item = so.items.find((i) => i.productId === productId);
      if (item)
        return item.product.salesUnit?.symbol || item.product.baseUnit?.symbol;
    }
    if (returnItem) {
      const item = returnItem.items.find((i) => i.productId === productId);
      if (item)
        return item.product.salesUnit?.symbol || item.product.baseUnit?.symbol;
    }
    return "-";
  };

  return (
    <PageFormLayout>
      <PageFormHeader>
        <PageFormTitle
          title={returnItem ? t("edit_return") : t("new_return")}
        />
        <PageFormActions>
          {!readonly && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={loading}
              >
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading
                  ? tCommon("saving")
                  : returnItem
                    ? tCommon("update")
                    : tCommon("create")}
              </Button>
            </>
          )}
          {readonly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (window.history.length > 1) {
                  router.back();
                } else {
                  window.close();
                }
              }}
            >
              <ArrowLeftSquare className="mr-2 h-4 w-4" />
              {tCommon("close")}
            </Button>
          )}
        </PageFormActions>
      </PageFormHeader>
      <PageFormContent className="grid gap-3 mt-3 p-0 bg-transparent border-none shadow-none">
        <form onSubmit={handleSubmit} className="space-y-3 w-full">
          <div className="space-y-3">
            <CollapsibleSection
              title={t("overview") || "Overview"}
              collapsedContent={
                <div className="flex flex-wrap gap-4 text-sm">
                  <span><strong>{t("return_number")}:</strong> {formData.returnNumber || "-"}</span>
                  <span><strong>{t("customer")}:</strong> {customers.find(c => c.id === formData.contactId)?.name || "-"}</span>
                  <span><strong>{t("return_date")}:</strong> {formData.returnDate ? new Date(formData.returnDate).toLocaleDateString("id-ID") : "-"}</span>
                </div>
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <CustomInput
                      label={t("return_number")}
                      value={formData.returnNumber}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          returnNumber: e.target.value,
                        })
                      }
                      placeholder={t("placeholder_auto_generate")}
                      disabled={readonly}
                    />
                    <div>
                      <label className="text-sm font-medium">
                        {t("customer")}
                      </label>
                      <SearchableSelect
                        value={formData.contactId}
                        onValueChange={(val: any) => handleContactChange(val)}
                        options={customers.map((c) => ({
                          label: c.name,
                          value: c.id,
                          icon: (
                            <Avatar size="sm">
                              <AvatarFallback className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                                {c.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          ),
                        }))}
                        disabled={readonly}
                        placeholder={t("placeholder_select_customer")}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <CustomSelect
                      label={t("sales_order_optional")}
                      value={formData.salesOrderId || ""}
                      onValueChange={(val: any) =>
                        handleSalesOrderChange(val)
                      }
                      options={filteredSalesOrders.map((so) => ({
                        label: so.orderNumber,
                        value: so.id,
                      }))}
                      disabled={readonly || !formData.contactId}
                      placeholder={t("placeholder_select_so")}
                    />

                    <CustomSelect
                      label={t("sales_invoice")}
                      value={formData.salesInvoiceId || ""}
                      onValueChange={(val: any) =>
                        setFormData((prev) => ({
                          ...prev,
                          salesInvoiceId: val,
                        }))
                      }
                      options={filteredSalesInvoices.map((si) => ({
                        label: si.invoiceNumber,
                        value: si.id,
                      }))}
                      disabled={readonly || !formData.contactId}
                      placeholder={t("placeholder_select_invoice")}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <CustomInput
                      label={t("return_date")}
                      type="date"
                      value={
                        formData.returnDate instanceof Date
                          ? formData.returnDate.toISOString().split("T")[0]
                          : formData.returnDate
                      }
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          returnDate: new Date(e.target.value),
                        }))
                      }
                      disabled={readonly}
                    />

                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <CustomSelect
                          label={t("status")}
                          value={formData.status || "DRAFT"}
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          onValueChange={(val: any) =>
                            setFormData((prev) => ({ ...prev, status: val }))
                          }
                          options={[
                            { label: t("status_draft"), value: "DRAFT" },
                            {
                              label: t("status_approved"),
                              value: "APPROVED",
                            },
                            {
                              label: t("status_completed"),
                              value: "COMPLETED",
                            },
                            {
                              label: t("status_cancelled"),
                              value: "CANCELLED",
                            },
                          ]}
                          disabled={
                            readonly ||
                            returnItem?.status === "COMPLETED" ||
                            returnItem?.status === "CANCELLED"
                          }
                        />
                      </div>
                      {returnItem && (
                        <div className="pb-1">
                          <StatusHistoryDialog
                            events={[
                              {
                                event: "Created",
                                at: returnItem.createdAt,
                                byName: returnItem.createdBy?.name,
                              },
                              {
                                event: "Last Updated",
                                at: returnItem.updatedAt,
                                byName: returnItem.updatedBy?.name,
                              },
                              {
                                event: "Approved",
                                at: returnItem.approvedAt,
                                byName: returnItem.approvedBy?.name,
                              },
                              {
                                event: "Completed",
                                at: returnItem.completedAt,
                                byName: returnItem.completedBy?.name,
                              },
                              {
                                event: "Cancelled",
                                at: returnItem.cancelledAt,
                                byName: returnItem.cancelledBy?.name,
                              },
                            ]}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        {t("department")}
                      </label>
                      <SearchableSelect
                        value={formData.departmentId || ""}
                        onValueChange={(val) =>
                          setFormData((prev) => ({
                            ...prev,
                            departmentId: val || null,
                          }))
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
                      <label className="text-sm font-medium">
                        {t("project")}
                      </label>
                      <SearchableSelect
                        value={formData.projectId || ""}
                        onValueChange={(val) =>
                          setFormData((prev) => ({
                            ...prev,
                            projectId: val || null,
                          }))
                        }
                        options={projects.map((p) => ({
                          value: p.id,
                          label: p.name,
                        }))}
                        placeholder={t("placeholder_select_project")}
                        disabled={readonly}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAttachmentDialogOpen(true)}
                      className="w-fit"
                    >
                      <Paperclip className="mr-2 h-4 w-4" />
                      {tCommon("attachments")} ({attachments.length})
                    </Button>
                  </div>
                </div>

                <CustomTextarea
                  value={formData.notes || ""}
                  label={t("notes")}
                  className="resize-none h-[77%]"
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  placeholder={t("placeholder_notes")}
                  disabled={readonly}
                />
              </div>
            </CollapsibleSection>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-lg">{t("return_items")}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]"></TableHead>
                        <TableHead>{tCommon("product")}</TableHead>
                        <TableHead className="w-[150px]">
                          {tCommon("quantity")}
                        </TableHead>
                        <TableHead className="w-[80px]">
                          {tCommon("unit")}
                        </TableHead>
                        <TableHead className="w-[150px]">
                          {tCommon("price")}
                        </TableHead>
                        <TableHead className="w-[150px] text-right">
                          {tCommon("total")}
                        </TableHead>
                        {!readonly && (
                          <TableHead className="w-[50px]"></TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <SortableContext
                        items={formData.items.map((item) => item.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {formData.items.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              className="text-center h-24 text-muted-foreground"
                            >
                              {t("no_returns_found")}
                            </TableCell>
                          </TableRow>
                        ) : (
                          formData.items.map((item, index) => (
                            <SortableTableRow key={item.id} id={item.id}>
                              <TableCell>
                                {getProductName(item.productId)}
                              </TableCell>
                              <TableCell>
                                <CustomInput
                                  type="number"
                                  min="0"
                                  value={item.quantity}
                                  onChange={(e) =>
                                    handleItemChange(
                                      index,
                                      "quantity",
                                      Number(e.target.value),
                                    )
                                  }
                                  disabled={readonly}
                                />
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {getProductUnit(item.productId)}
                              </TableCell>
                              <TableCell>
                                <CustomInput
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item.unitPrice}
                                  onChange={(e) =>
                                    handleItemChange(
                                      index,
                                      "unitPrice",
                                      Number(e.target.value),
                                    )
                                  }
                                  disabled={readonly}
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                {(
                                  item.quantity * item.unitPrice
                                ).toLocaleString()}
                              </TableCell>
                              {!readonly && (
                                <TableCell>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveItem(index)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              )}
                            </SortableTableRow>
                          ))
                        )}
                      </SortableContext>
                    </TableBody>
                  </Table>
                </DndContext>
                <div className="flex justify-between items-start p-3 border-t">
                  <div className="text-right">
                    <span className="font-medium mr-4">
                      {tCommon("total")}:
                    </span>
                    <span className="text-xl font-bold">
                      {formatCurrency(calculateTotal())}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </form>
      </PageFormContent>

      <AttachmentDialog
        open={isAttachmentDialogOpen}
        onOpenChange={setIsAttachmentDialogOpen}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        uploadAction={async (formData) => {
          const res = await uploadFile(formData);
          return res;
        }}
        readonly={readonly}
      />
    </PageFormLayout>
  );
}
