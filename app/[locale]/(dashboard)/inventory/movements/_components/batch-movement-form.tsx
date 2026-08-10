"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { SelectItem } from "@/components/ui/select";
import {
  Plus,
  Trash2,
  GripVertical,
  Save,
  ArrowLeft,
  Loader2,
} from "lucide-react";
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
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Product,
  Warehouse,
  MovementType,
} from "@/prisma/generated/prisma/browser";
import { createBatchMovement } from "../actions";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { SortableTableRow } from "@/components/ui/sortable-row";
import { generateId } from "@/services/lib/utils";

interface BatchMovementFormProps {
  products: (Omit<
    Product,
    | "price"
    | "cost"
    | "averageCost"
    | "purchaseConversionFactor"
    | "salesConversionFactor"
  > & {
    price: number;
    cost: number;
    averageCost: number;
    purchaseConversionFactor: number;
    salesConversionFactor: number;
  })[];
  warehouses: Warehouse[];
}

export function BatchMovementForm({
  products,
  warehouses,
}: BatchMovementFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [type, setType] = useState<MovementType>("IN");
  const [fromWarehouseId, setFromWarehouseId] = useState<string>("");
  const [toWarehouseId, setToWarehouseId] = useState<string>("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const [items, setItems] = useState<
    {
      id: string;
      productId: string;
      quantity: string;
      unitCost: string;
      notes: string;
    }[]
  >([
    {
      id: generateId(),
      productId: "",
      quantity: "1",
      unitCost: "",
      notes: "",
    },
  ]);

  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const updateItem = (index: number, field: string, value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };

    // Auto-fill unit cost if product selected and not set
    if (field === "productId") {
      const product = products.find((p) => p.id === value);
      if (product) {
        // Default to averageCost or cost.
        // Note: product from props might need to include numeric fields if they are Decimal in prisma
        // Assuming products passed are already formatted or we handle Decimal string
        const cost = product.averageCost || product.cost || 0;
        if (!newItems[index].unitCost) {
          newItems[index].unitCost = cost.toString();
        }
      }
    }

    setItems(newItems);
  };

  const addItem = () => {
    setItems([
      ...items,
      {
        id: generateId(),
        productId: "",
        quantity: "1",
        unitCost: "",
        notes: "",
      },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if ((type === "OUT" || type === "TRANSFER") && !fromWarehouseId) {
      setError("Source location is required for OUT and TRANSFER");
      return;
    }
    if (
      (type === "IN" || type === "TRANSFER" || type === "ADJUSTMENT") &&
      !toWarehouseId
    ) {
      setError(
        "Destination location is required for IN, TRANSFER and ADJUSTMENT"
      );
      return;
    }
    if (type === "TRANSFER" && fromWarehouseId === toWarehouseId) {
      setError("Source and destination locations cannot be the same");
      return;
    }

    const validItems = items.filter(
      (item) => item.productId && parseFloat(item.quantity) > 0
    );

    if (validItems.length === 0) {
      setError("At least one item with product and quantity is required");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createBatchMovement({
        type,
        fromWarehouseId: fromWarehouseId || undefined,
        toWarehouseId: toWarehouseId || undefined,
        reference,
        notes,
        items: validItems.map((item) => ({
          productId: item.productId,
          quantity: parseFloat(item.quantity),
          unitCost: item.unitCost ? parseFloat(item.unitCost) : undefined,
          notes: item.notes,
        })),
      });

      if (result.success) {
        router.push("/inventory/movements");
      } else {
        setError(result.error || "Failed to create movement");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="grid grid-cols-2 gap-4">
            <CustomSelect
              label="Type"
              value={type}
              onValueChange={(v: string) => setType(v as MovementType)}
              containerClassName="space-y-2"
            >
              <SelectItem value="IN">In (Purchase/Return)</SelectItem>
              <SelectItem value="OUT">Out (Sale/Loss)</SelectItem>
              <SelectItem value="TRANSFER">Transfer</SelectItem>
              <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
            </CustomSelect>

            <CustomInput
              label="Reference"
              placeholder="PO-123, SO-456, etc."
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              containerClassName="space-y-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {(type === "OUT" || type === "TRANSFER") && (
              <CustomSelect
                label="From Location"
                value={fromWarehouseId}
                onValueChange={setFromWarehouseId}
                placeholder="Select source location"
                containerClassName="space-y-2"
              >
                {warehouses?.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </CustomSelect>
            )}

            {(type === "IN" ||
              type === "TRANSFER" ||
              type === "ADJUSTMENT") && (
                <CustomSelect
                  label={type === "TRANSFER" ? "To Location" : "Location"}
                  value={toWarehouseId}
                  onValueChange={setToWarehouseId}
                  placeholder="Select destination location"
                  containerClassName="space-y-2"
                >
                  {warehouses?.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </CustomSelect>
              )}
          </div>

          <CustomTextarea
            label="Notes"
            placeholder="Additional notes about this movement batch..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            containerClassName="space-y-2"
          />

          <div className="rounded-md border">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead className="w-[300px]">Product</TableHead>
                    <TableHead className="w-[120px]">Quantity</TableHead>
                    <TableHead className="w-[150px]">Unit Cost</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <SortableContext
                    items={items}
                    strategy={verticalListSortingStrategy}
                  >
                    {items.map((item, index) => (
                      <SortableTableRow key={item.id} id={item.id}>
                        <TableCell>
                          <CustomSelect
                            value={item.productId}
                            onValueChange={(val) =>
                              updateItem(index, "productId", val)
                            }
                            placeholder="Select product"
                            containerClassName="w-full"
                          >
                            {products.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.sku} - {product.name}
                              </SelectItem>
                            ))}
                          </CustomSelect>
                        </TableCell>
                        <TableCell>
                          <CustomInput
                            type="number"
                            min="0"
                            step="any"
                            value={item.quantity}
                            onChange={(e) =>
                              updateItem(index, "quantity", e.target.value)
                            }
                            containerClassName="w-full"
                          />
                        </TableCell>
                        <TableCell>
                          <CustomInput
                            type="number"
                            min="0"
                            step="any"
                            value={item.unitCost}
                            onChange={(e) =>
                              updateItem(index, "unitCost", e.target.value)
                            }
                            placeholder="Optional"
                            containerClassName="w-full"
                          />
                        </TableCell>
                        <TableCell>
                          <CustomInput
                            value={item.notes}
                            onChange={(e) =>
                              updateItem(index, "notes", e.target.value)
                            }
                            placeholder="Item notes"
                            containerClassName="w-full"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(index)}
                            disabled={items.length <= 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </SortableTableRow>
                    ))}
                  </SortableContext>
                </TableBody>
              </Table>
            </DndContext>
          </div>

          {error && <div className="text-red-600 text-sm">{error}</div>}

          <div className="flex justify-between border-t pt-4">
            <div className="flex items-start">
              <Button type="button" variant="outline" onClick={addItem}>
                <Plus className="mr-2 h-4 w-4" /> Add Line
              </Button>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={isSubmitting}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {isSubmitting ? "Saving..." : "Save Movement"}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
