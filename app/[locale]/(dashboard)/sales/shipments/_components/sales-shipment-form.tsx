"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent} from "@/components/ui/card";
import { CustomInput } from "@/components/ui/custom-input";
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
import { Trash2, ArrowLeft, Paperclip } from "lucide-react";
import { createSalesShipment, updateSalesShipment } from "../actions";
import { SalesShipmentInput, SalesShipmentWithDetails } from "../types";
import { CustomSelect } from "@/components/ui/custom-select";
import { useToast } from "@/hooks/use-toast";
import { CustomTextarea } from "@/components/ui/custom-textarea";
import { SortableTableRow } from "@/components/ui/sortable-row";
import { generateId } from "@/services/lib/utils";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";
import { SalesOrderWithDetails } from "../../orders/types";
import {
  AttachmentDialog,
  Attachment,
} from "@/components/ui/attachment-dialog";
import { uploadFile } from "@/app/[locale]/(dashboard)/general/files/actions";
import { Department, Project } from "@/prisma/generated/prisma/client";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  PageFormActions,
  PageFormContent,
  PageFormHeader,
  PageFormLayout,
  PageFormTitle,
} from "@/components/layout/page/form-layout";
import { useTranslations } from "next-intl";
import { StatusHistoryDialog } from "@/components/ui/status-history-dialog";
import { CollapsibleSection } from "@/components/ui/collapsible-section";

interface SalesShipmentFormProps {
  shipment?: SuperJSONResult;
  customers: { id: string; name: string }[];
  salesOrders: SuperJSONResult;
  departments?: Department[];
  projects?: Project[];
  readonly?: boolean;
}

export function SalesShipmentForm({
  shipment: serializedShipment,
  customers,
  salesOrders: serializedSalesOrders,
  departments = [],
  projects = [],
  readonly = false,
}: SalesShipmentFormProps) {
  const router = useRouter();
  const t = useTranslations("Sales");
  const tCommon = useTranslations("Common");
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const shipment = serializedShipment
    ? SuperJSON.deserialize<SalesShipmentWithDetails>(serializedShipment)
    : undefined;

  const [attachments, setAttachments] = useState<Attachment[]>(
    shipment?.attachments?.map((a) => ({
      id: a.id,
      name: a.name,
      url: a.url,
    })) || [],
  );
  const [isAttachmentDialogOpen, setIsAttachmentDialogOpen] = useState(false);

  const salesOrders = useMemo(
    () => SuperJSON.deserialize<SalesOrderWithDetails[]>(serializedSalesOrders),
    [serializedSalesOrders],
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const [formData, setFormData] = useState<
    Omit<SalesShipmentInput, "items"> & {
      items: (SalesShipmentInput["items"][0] & { id: string })[];
    }
  >({
    contactId: shipment?.contactId || "",
    salesOrderId: shipment?.salesOrderId || undefined,
    departmentId: shipment?.departmentId || null,
    projectId: shipment?.projectId || null,
    shipmentDate: shipment?.shipmentDate
      ? new Date(shipment.shipmentDate)
      : new Date(),
    notes: shipment?.notes || "",
    trackingNumber: shipment?.trackingNumber || "",
    carrier: shipment?.carrier || "",
    items:
      shipment?.items.map((item) => ({
        id: generateId(),
        productId: item.productId,
        quantity: item.quantity,
        salesOrderItemId: item.salesOrderItemId || undefined,
      })) || [],
  });

  const filteredSalesOrders = useMemo(() => {
    if (formData.contactId) {
      return salesOrders.filter((so) => so.contactId === formData.contactId);
    }
    return [];
  }, [formData.contactId, salesOrders]);

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
        ? so.items
            .map((item) => ({
              id: generateId(),
              productId: item.productId,
              quantity: item.quantity - item.shippedQuantity, // Default to remaining quantity
              salesOrderItemId: item.id,
            }))
            .filter((item) => item.quantity > 0) // Only include items with remaining quantity
        : [],
    }));
  };

  const handleItemChange = (
    index: number,
    field: keyof SalesShipmentInput["items"][0],
    value: number,
  ) => {
    setFormData((prev) => {
      const newItems = [...prev.items];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      newItems[index] = { ...newItems[index], [field]: value } as any;
      return { ...prev, items: newItems };
    });
  };

  const handleRemoveItem = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
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
      if (shipment) {
        const result = await updateSalesShipment(shipment.id, submissionData);
        if (!result.success) throw new Error(result.error);
        toast({
          title: "Success",
          description: "Sales shipment updated successfully",
        });
      } else {
        const result = await createSalesShipment(submissionData);
        if (!result.success) throw new Error(result.error);
        toast({
          title: "Success",
          description: "Sales shipment created successfully",
        });
      }
      router.push("/sales/shipments");
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
    if (shipment) {
      const item = shipment.items.find((i) => i.productId === productId);
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
    if (shipment) {
      const item = shipment.items.find((i) => i.productId === productId);
      if (item)
        return item.product.salesUnit?.symbol || item.product.baseUnit?.symbol;
    }
    return "-";
  };

  return (
    <PageFormLayout>
      <form onSubmit={handleSubmit} className="space-y-8 w-full">
        <PageFormHeader>
          <div className="flex items-center gap-2">
            <PageFormTitle
              title={shipment ? t("edit_shipment") : t("new_shipment")}
            />
            {shipment && (
              <StatusHistoryDialog
                events={[
                  {
                    event: "Created",
                    at: shipment.createdAt,
                    byName: shipment.createdBy?.name,
                  },
                  {
                    event: "Last Updated",
                    at: shipment.updatedAt,
                    byName: shipment.updatedBy?.name,
                  },
                  {
                    event: "Completed",
                    at: shipment.completedAt,
                    byName: shipment.completedBy?.name,
                  },
                  {
                    event: "Cancelled",
                    at: shipment.cancelledAt,
                    byName: shipment.cancelledBy?.name,
                  },
                ]}
              />
            )}
          </div>
          <PageFormActions>
            {!readonly && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading
                    ? tCommon("saving")
                    : shipment
                      ? tCommon("update")
                      : tCommon("create")}
                </Button>
              </>
            )}
            {readonly && (
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                <ArrowLeft className="mr-2 h-4 w-4" /> {tCommon("back")}
              </Button>
            )}
          </PageFormActions>
        </PageFormHeader>
        <PageFormContent className="grid gap-3 mt-3 p-0 bg-transparent border-none shadow-none">
          <div className="space-y-3">
            <CollapsibleSection
              title={t("overview") || "Overview"}
              collapsedContent={
                <div className="flex flex-wrap gap-4 text-sm">
                  <span><strong>{t("shipment_number")}:</strong> {shipment?.shipmentNumber || "-"}</span>
                  <span><strong>{t("customer")}:</strong> {customers.find(c => c.id === formData.contactId)?.name || "-"}</span>
                  <span><strong>{t("shipment_date")}:</strong> {formData.shipmentDate ? new Date(formData.shipmentDate).toLocaleDateString("id-ID") : "-"}</span>
                </div>
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <CustomInput
                      label={t("shipment_number")}
                      value={
                        shipment?.shipmentNumber ||
                        t("placeholder_auto_generate")
                      }
                      disabled={true}
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

                    <CustomInput
                      label={t("shipment_date")}
                      type="date"
                      value={
                        formData.shipmentDate.toISOString().split("T")[0]
                      }
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          shipmentDate: new Date(e.target.value),
                        })
                      }
                      disabled={readonly}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <CustomInput
                      label={t("tracking_number")}
                      value={formData.trackingNumber || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          trackingNumber: e.target.value,
                        })
                      }
                      disabled={readonly}
                      placeholder={t("tracking_number")}
                    />

                    <CustomInput
                      label={t("carrier")}
                      value={formData.carrier || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, carrier: e.target.value })
                      }
                      disabled={readonly}
                      placeholder={t("carrier")}
                    />
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
                              colSpan={5}
                              className="text-center h-24 text-muted-foreground"
                            >
                              {t("no_shipments_found")}
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
              </CardContent>
            </Card>
          </div>
        </PageFormContent>
      </form>
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
