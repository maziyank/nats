"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
} from "@/components/ui/card";
import { CustomInput } from "@/components/ui/custom-input";
import { CustomTextarea } from "@/components/ui/custom-textarea";
import { Loader2, SaveIcon, ArrowLeftSquare, PlayCircle, CheckCircle, XCircle } from "lucide-react";
import {
    createProductionOrder,
    updateProductionOrder,
    releaseProductionOrder,
    closeProductionOrder,
    cancelProductionOrder,
} from "../actions";
import { ProductionOrderInput } from "../types";
import { generateId } from "@/services/lib/utils";
import { useAlert } from "@/hooks/use-alert";
import { useConfirm } from "@/hooks/use-confirm";
import { SuperJSONResult } from "superjson";
import { SuperJSON } from "@/services/lib/superjson";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useTranslations } from "next-intl";

interface ProductOption {
    id: string;
    name: string;
    sku: string;
}

interface BOMOption {
    id: string;
    bomNumber: string;
    name: string;
    productId: string;
}

interface OrderWithDetails {
    id: string;
    orderNumber: string;
    billOfMaterialId: string | null;
    productId: string;
    plannedQuantity: number;
    producedQuantity: number;
    startDate: Date | null;
    endDate: Date | null;
    notes: string | null;
    status: string;
    createdAt: Date;
}

interface ProductionOrderFormProps {
    order?: SuperJSONResult;
    products: SuperJSONResult;
    boms: SuperJSONResult;
    readonly?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
    DRAFT: "bg-gray-500",
    RELEASED: "bg-blue-500",
    IN_PROGRESS: "bg-yellow-500",
    COMPLETED: "bg-green-500",
    CANCELLED: "bg-red-500",
};

export function ProductionOrderForm({
    order: serializedOrder,
    products: serializedProducts,
    boms: serializedBOMs,
    readonly = false,
}: ProductionOrderFormProps) {
    const t = useTranslations("Production");
    const tCommon = useTranslations("Common");
    const order = serializedOrder
        ? SuperJSON.deserialize<OrderWithDetails>(serializedOrder)
        : undefined;
    const products = serializedProducts && "json" in serializedProducts
        ? SuperJSON.deserialize<ProductOption[]>(serializedProducts)
        : [];
    const boms = serializedBOMs && "json" in serializedBOMs
        ? SuperJSON.deserialize<BOMOption[]>(serializedBOMs)
        : [];

    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const isEditing = !!order;
    const isDraft = order?.status === "DRAFT" || !order;
    const isReadOnly = readonly || !isDraft;
    const alert = useAlert();
    const confirm = useConfirm();

    const [formData, setFormData] = useState<ProductionOrderInput>({
        billOfMaterialId: order?.billOfMaterialId || undefined,
        productId: order?.productId || "",
        plannedQuantity: order?.plannedQuantity || 1,
        startDate: order?.startDate ? new Date(order.startDate) : undefined,
        endDate: order?.endDate ? new Date(order.endDate) : undefined,
        notes: order?.notes || undefined,
    });

    const handleBOMChange = (bomId: string | null) => {
        if (!bomId) {
            setFormData((prev) => ({ ...prev, billOfMaterialId: undefined }));
            return;
        }
        const selectedBOM = boms.find((b) => b.id === bomId);
        setFormData((prev) => ({
            ...prev,
            billOfMaterialId: bomId,
            productId: selectedBOM?.productId || prev.productId,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isReadOnly) return;

        if (!formData.productId) {
            await alert({ title: tCommon("error"), description: t("select_product") });
            return;
        }
        if (formData.plannedQuantity <= 0) {
            await alert({ title: tCommon("error"), description: "Planned quantity must be > 0" });
            return;
        }

        setIsLoading(true);
        try {
            let result;
            if (isEditing && order) {
                result = await updateProductionOrder(order.id, formData);
            } else {
                result = await createProductionOrder(formData);
            }

            if (result.success) {
                router.push("/production/orders");
            } else {
                await alert({ title: tCommon("error"), description: result.error });
            }
        } catch (error) {
            console.error(error);
            await alert({ title: tCommon("error"), description: t("create_error") });
        } finally {
            setIsLoading(false);
        }
    };

    const handleAction = async (
        action: (id: string) => Promise<{ success: boolean; error?: string }>,
        confirmTitle: string,
        confirmDesc: string,
    ) => {
        if (!order) return;
        if (await confirm({ title: confirmTitle, description: confirmDesc })) {
            setIsLoading(true);
            try {
                const result = await action(order.id);
                if (!result.success)
                    await alert({ title: tCommon("error"), description: result.error });
            } finally {
                setIsLoading(false);
            }
        }
    };

    const productOptions = products.map((p) => ({
        value: p.id,
        label: `${p.name} (${p.sku})`,
    }));

    const bomOptions = boms.map((b) => ({
        value: b.id,
        label: `${b.bomNumber} - ${b.name}`,
    }));

    return (
        <div className="flex-1 space-y-4 px-4 pt-0">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold tracking-tight">
                        {order ? `${t("order_number")} ${order.orderNumber}` : t("new_order")}
                    </h2>
                    {order && (
                        <Badge className={STATUS_COLORS[order.status] || "bg-gray-500"}>
                            {order.status.replace("_", " ")}
                        </Badge>
                    )}
                </div>
                <div className="flex gap-2">
                    {isDraft && !readonly && (
                        <Button type="submit" disabled={isLoading} onClick={handleSubmit}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {!isLoading && <SaveIcon className="mr-2 h-4 w-4" />}
                            {isEditing ? tCommon("save") : tCommon("create")}
                        </Button>
                    )}
                    {order?.status === "DRAFT" && !readonly && isEditing && (
                        <Button
                            type="button"
                            onClick={() =>
                                handleAction(releaseProductionOrder, t("release"), "Release this production order?")
                            }
                            disabled={isLoading}
                        >
                            <PlayCircle className="mr-2 h-4 w-4" />
                            {t("release")}
                        </Button>
                    )}
                    {(order?.status === "RELEASED" || order?.status === "IN_PROGRESS") && !readonly && (
                        <Button
                            type="button"
                            onClick={() =>
                                handleAction(closeProductionOrder, t("close_order"), "Close this production order?")
                            }
                            disabled={isLoading}
                        >
                            <CheckCircle className="mr-2 h-4 w-4" />
                            {t("close_order")}
                        </Button>
                    )}
                    {order && order.status !== "COMPLETED" && order.status !== "CANCELLED" && !readonly && (
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={() =>
                                handleAction(cancelProductionOrder, t("cancel_order"), "Cancel this production order?")
                            }
                            disabled={isLoading}
                        >
                            <XCircle className="mr-2 h-4 w-4" />
                            {t("cancel_order")}
                        </Button>
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={() => router.back()}>
                        <ArrowLeftSquare className="mr-2 h-4 w-4" />
                        {tCommon("back")}
                    </Button>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <Card>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>{t("bom")}</Label>
                                    <SearchableSelect
                                        value={formData.billOfMaterialId || ""}
                                        onValueChange={handleBOMChange}
                                        options={bomOptions}
                                        placeholder={t("select_bom")}
                                        disabled={isReadOnly}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>{t("product")}</Label>
                                    <SearchableSelect
                                        value={formData.productId}
                                        onValueChange={(val) =>
                                            setFormData((prev) => ({ ...prev, productId: val || "" }))
                                        }
                                        options={productOptions}
                                        placeholder={t("select_product")}
                                        disabled={isReadOnly}
                                    />
                                </div>
                                <CustomInput
                                    label={t("planned_qty")}
                                    id="plannedQuantity"
                                    type="number"
                                    min="1"
                                    value={formData.plannedQuantity}
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            plannedQuantity: Number(e.target.value),
                                        }))
                                    }
                                    disabled={isReadOnly}
                                />
                                {order && (
                                    <div className="rounded-md border p-3">
                                        <p className="text-sm font-medium">{t("produced_qty")}: {order.producedQuantity} / {order.plannedQuantity}</p>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-2">
                                    <CustomInput
                                        type="date"
                                        label={t("start_date")}
                                        id="startDate"
                                        value={
                                            formData.startDate
                                                ? format(formData.startDate, "yyyy-MM-dd")
                                                : ""
                                        }
                                        onChange={(e) =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                startDate: e.target.value ? new Date(e.target.value) : undefined,
                                            }))
                                        }
                                        disabled={isReadOnly}
                                    />
                                    <CustomInput
                                        type="date"
                                        label={t("end_date")}
                                        id="endDate"
                                        value={
                                            formData.endDate
                                                ? format(formData.endDate, "yyyy-MM-dd")
                                                : ""
                                        }
                                        onChange={(e) =>
                                            setFormData((prev) => ({
                                                ...prev,
                                                endDate: e.target.value ? new Date(e.target.value) : undefined,
                                            }))
                                        }
                                        disabled={isReadOnly}
                                    />
                                </div>
                                <CustomTextarea
                                    value={formData.notes || ""}
                                    label={t("notes")}
                                    className="resize-none"
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            notes: e.target.value,
                                        }))
                                    }
                                    disabled={isReadOnly}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </form>
        </div>
    );
}
