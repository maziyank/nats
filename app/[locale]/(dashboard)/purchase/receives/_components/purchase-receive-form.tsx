"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomInput } from "@/components/ui/custom-input";
import { CustomSelect } from "@/components/ui/custom-select";
import { CustomTextarea } from "@/components/ui/custom-textarea";
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
import { Loader2, Plus, Trash2, ArrowLeft, Paperclip } from "lucide-react";
import {
  createPurchaseReceive,
  updatePurchaseReceive,
  getPurchaseOrder,
} from "../actions";
import { PurchaseReceiveInput } from "../types";
import { SortableTableRow } from "@/components/ui/sortable-row";
import { getContacts } from "@/app/[locale]/(dashboard)/general/contacts/actions";
import { generateId } from "@/lib/utils";
import { SuperJSON } from "@/lib/superjson";
import { SuperJSONResult } from "superjson";
import { PurchaseReceiveWithDetails } from "../types";
import { PurchaseOrderWithDetails } from "../../orders/types";
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

interface ProductForSelect {
  id: string;
  name: string;
  sku: string;
  baseUnit: { symbol: string } | null;
  purchaseUnit: { symbol: string } | null;
}

interface PurchaseOrderForSelect {
  id: string;
  orderNumber: string;
  contactId: string;
  contact: { name: string };
  items: {
    id: string;
    productId: string;
    quantity: number;
    receivedQuantity: number;
  }[];
}

interface PurchaseReceiveFormProps {
  receive?: SuperJSONResult | null;
  vendors: Awaited<ReturnType<typeof getContacts>>["data"];
  departments: Department[];
  projects: Project[];
  products: SuperJSONResult | any[];
  purchaseOrders: SuperJSONResult | any[];
  readonly?: boolean;
}

export function PurchaseReceiveForm({
  receive: serializedReceive,
  vendors,
  departments,
  projects,
  products: serializedProducts,
  purchaseOrders: serializedPurchaseOrders,
  readonly = false,
}: PurchaseReceiveFormProps) {
  const router = useRouter();
  const t = useTranslations("Purchase");
  const tCommon = useTranslations("Common");
  const [isLoading, setIsLoading] = useState(false);

  const receive = serializedReceive
    ? SuperJSON.deserialize<PurchaseReceiveWithDetails>(serializedReceive)
    : undefined;

  const products = useMemo(
    () =>
      Array.isArray(serializedProducts)
        ? []
        : SuperJSON.deserialize<ProductForSelect[]>(
            serializedProducts as SuperJSONResult,
          ),
    [serializedProducts],
  );

  const purchaseOrders = useMemo(
    () =>
      Array.isArray(serializedPurchaseOrders)
        ? []
        : SuperJSON.deserialize<PurchaseOrderForSelect[]>(
            serializedPurchaseOrders as SuperJSONResult,
          ),
    [serializedPurchaseOrders],
  );

  const isEditing = !!receive;

  const [attachments, setAttachments] = useState<Attachment[]>(
    receive?.attachments?.map((a) => ({
      id: a.id,
      name: a.name,
      url: a.url,
    })) || [],
  );
  const [isAttachmentDialogOpen, setIsAttachmentDialogOpen] = useState(false);

  const [formData, setFormData] = useState<
    Omit<PurchaseReceiveInput, "items"> & {
      items: (PurchaseReceiveInput["items"][0] & { id: string })[];
    }
  >({
    contactId: receive?.contactId || "",
    purchaseOrderId: receive?.purchaseOrderId || undefined,
    departmentId: receive?.departmentId || null,
    projectId: receive?.projectId || null,
    receiveDate: receive?.receiveDate
      ? new Date(receive.receiveDate)
      : new Date(),
    notes: receive?.notes || "",
    items:
      receive?.items.map((item) => ({
        id: generateId(),
        productId: item.productId,
        quantity: item.quantity,
        purchaseOrderItemId: item.purchaseOrderItemId || undefined,
      })) || [],
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setFormData((prev) => {
        const oldIndex = prev.items.findIndex((item) => item.id === active.id);
        const newIndex = prev.items.findIndex((item) => item.id === over.id);
        return { ...prev, items: arrayMove(prev.items, oldIndex, newIndex) };
      });
    }
  };

  const [status, setStatus] = useState<"DRAFT" | "COMPLETED" | "CANCELLED">(
    receive?.status || "DRAFT",
  );

  // Filter purchase orders based on selected vendor
  const filteredPurchaseOrders = useMemo(() => {
    if (formData.contactId) {
      return purchaseOrders.filter((po) => po.contactId === formData.contactId);
    }
    return [];
  }, [formData.contactId, purchaseOrders]);

  // When Purchase Order is selected, populate items
  const handlePurchaseOrderChange = async (poId: string) => {
    setFormData((prev) => ({ ...prev, purchaseOrderId: poId }));

    if (poId) {
      try {
        const serializedPo = await getPurchaseOrder(poId);
        if (serializedPo) {
          const po =
            SuperJSON.deserialize<PurchaseOrderWithDetails>(serializedPo);
          // Auto-select vendor
          setFormData(
            (prev) =>
              ({
                ...prev,
                contactId: po.contactId,
                departmentId: (po.departmentId as string) || prev.departmentId,
                projectId: (po.projectId as string) || prev.projectId,
                items: po.items
                  .filter((item) => item.quantity > item.receivedQuantity)
                  .map((item) => ({
                    id: generateId(),
                    productId: item.productId,
                    quantity: item.quantity - item.receivedQuantity,
                    purchaseOrderItemId: item.id,
                  })),
              }) as any,
          );
        }
      } catch (error) {
        console.error("Failed to fetch PO details", error);
      }
    } else {
      setFormData((prev) => ({ ...prev, items: [] }));
    }
  };

  const handleAddItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { id: generateId(), productId: "", quantity: 1 }],
    }));
  };

  const handleRemoveItem = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const handleItemChange = (
    index: number,
    field: keyof (typeof formData.items)[0],
    value: string | number | undefined,
  ) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value } as any;
    setFormData((prev) => ({ ...prev, items: newItems }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.contactId) {
      alert("Please select a vendor");
      return;
    }
    if (formData.items.length === 0) {
      alert("Please add at least one item");
      return;
    }
    for (const item of formData.items) {
      if (!item.productId) {
        alert("Please select a product for all items");
        return;
      }
      if (item.quantity <= 0) {
        alert("Quantity must be greater than 0");
        return;
      }
    }

    setIsLoading(true);
    try {
      let result;
      const dataToSubmit = {
        ...formData,
        status,
        items: formData.items.map(({ id: _id, ...item }) => item),
        attachmentIds: attachments.map((a) => a.id),
      };

      if (isEditing && receive) {
        result = await updatePurchaseReceive(receive.id, dataToSubmit);
      } else {
        result = await createPurchaseReceive(dataToSubmit);
      }

      if (result.success) {
        router.push("/purchase/receives");
      } else {
        alert(result.error);
      }
    } catch (error) {
      console.error(error);
      alert("An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const getProductName = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    return product ? `${product.name} (${product.sku})` : "Unknown Product";
  };

  const getProductUnit = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    return product?.purchaseUnit?.symbol || product?.baseUnit?.symbol || "-";
  };

  return (
    <PageFormLayout>
      <form onSubmit={handleSubmit} className="space-y-8 w-full">
        <PageFormHeader>
          <PageFormTitle
            title={receive ? t("edit_receive") : t("new_receive")}
          />
          <PageFormActions>
            {!readonly && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={isLoading}
                >
                  {tCommon("cancel")}
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isEditing ? tCommon("update") : tCommon("create")}
                </Button>
                {isEditing && status !== "COMPLETED" && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStatus("COMPLETED")}
                  >
                    Mark as Completed
                  </Button>
                )}
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
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>{t("receive_number")}: {receive?.receiveNumber || "-"}</span>
                  <span>{t("vendor")}: {vendors.find((v) => v.id === formData.contactId)?.name || "-"}</span>
                </div>
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <CustomInput
                      label={t("receive_number")}
                      value={
                        receive?.receiveNumber ||
                        t("placeholder_auto_generate")
                      }
                      disabled={true}
                    />
                    <div>
                      <label className="text-sm font-medium">
                        {t("vendor")}
                      </label>
                      <SearchableSelect
                        value={formData.contactId}
                        onValueChange={(val) => {
                          setFormData((prev) => ({
                            ...prev,
                            contactId: val || "",
                            purchaseOrderId: undefined,
                          }));
                        }}
                        options={vendors.map((v) => ({
                          label: v.name,
                          value: v.id,
                          icon: (
                            <Avatar size="sm">
                              <AvatarFallback className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">
                                {v.name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          ),
                        }))}
                        placeholder={t("placeholder_select_vendor")}
                        disabled={readonly || !!formData.purchaseOrderId}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <CustomSelect
                      label={t("purchase_order_optional")}
                      value={formData.purchaseOrderId || ""}
                      onValueChange={(val) => handlePurchaseOrderChange(val)}
                      options={filteredPurchaseOrders.map((po) => ({
                        label: po.orderNumber,
                        value: po.id,
                      }))}
                      placeholder={t("placeholder_select_purchase_order")}
                      disabled={readonly || !formData.contactId}
                    />

                    <CustomInput
                      label={tCommon("date")}
                      type="date"
                      value={
                        formData.receiveDate
                          ? formData.receiveDate.toISOString().split("T")[0]
                          : ""
                      }
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          receiveDate: e.target.value
                            ? new Date(e.target.value)
                            : new Date(),
                        }))
                      }
                      disabled={readonly}
                      required
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

                  {isEditing && (
                    <div className="grid grid-cols-2 gap-2 items-end">
                      <CustomSelect
                        label={t("status")}
                        value={status}
                        onValueChange={(val) =>
                          setStatus(
                            val as "DRAFT" | "COMPLETED" | "CANCELLED",
                          )
                        }
                        options={[
                          { value: "DRAFT", label: "Draft" },
                          { value: "COMPLETED", label: "Completed" },
                          { value: "CANCELLED", label: "Cancelled" },
                        ]}
                        disabled={readonly || receive.status === "COMPLETED"}
                      />
                      {receive && (
                        <div className="pb-1">
                          <StatusHistoryDialog
                            events={[
                              {
                                event: "Created",
                                at: receive.createdAt,
                                byName: receive.createdBy?.name,
                              },
                              {
                                event: "Last Updated",
                                at: receive.updatedAt,
                                byName: receive.updatedBy?.name,
                              },
                              {
                                event: "Completed",
                                at: receive.completedAt,
                                byName: receive.completedBy?.name,
                              },
                              {
                                event: "Cancelled",
                                at: receive.cancelledAt,
                                byName: receive.cancelledBy?.name,
                              },
                            ]}
                          />
                        </div>
                      )}
                    </div>
                  )}

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
                  className="resize-none h-[80%]"
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      notes: e.target.value,
                    }))
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
                              {t("no_receives_found")}
                            </TableCell>
                          </TableRow>
                        ) : (
                          formData.items.map((item, index) => (
                            <SortableTableRow key={item.id} id={item.id}>
                              <TableCell>
                                {!!item.purchaseOrderItemId ? (
                                  <div className="py-2 px-3 text-sm">
                                    {getProductName(item.productId)}
                                  </div>
                                ) : (
                                  <CustomSelect
                                    value={item.productId}
                                    onValueChange={(val) =>
                                      handleItemChange(index, "productId", val)
                                    }
                                    options={products.map((p) => ({
                                      label: `${p.name} (${p.sku})`,
                                      value: p.id,
                                    }))}
                                    disabled={readonly}
                                  />
                                )}
                              </TableCell>
                              <TableCell>
                                <CustomInput
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) =>
                                    handleItemChange(
                                      index,
                                      "quantity",
                                      parseInt(e.target.value) || 0,
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
              {!readonly && (
                <div className="p-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddItem}
                  >
                    <Plus className="mr-2 h-4 w-4" /> {t("add_item")}
                  </Button>
                </div>
              )}
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
