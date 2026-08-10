export const dynamic = "force-dynamic";

import {
  getPurchaseReturn,
  getPurchaseOrdersForReturn,
  getPurchaseInvoicesForReturn,
} from "../../actions";
import { getContacts } from "@/app/[locale]/(dashboard)/general/contacts/actions";
import { ContactType } from "@/prisma/generated/prisma/enums";
import { PurchaseReturnForm } from "../../_components/purchase-return-form";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { SuperJSON } from "@/services/lib/superjson";
import { PurchaseReturnWithDetails } from "../../types";

export const metadata: Metadata = {
  title: "Edit Purchase Return | NATS",
  description: "Edit purchase return details",
};

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditPurchaseReturnPage(props: PageProps) {
  const params = await props.params;
  const [returnItem, vendors, purchaseOrders, purchaseInvoices] =
    await Promise.all([
      getPurchaseReturn(params.id),
      getContacts({ type: ContactType.VENDOR }),
      getPurchaseOrdersForReturn(),
      getPurchaseInvoicesForReturn(),
    ]);

  if (!returnItem) {
    notFound();
  }

  const deserializedReturn =
    SuperJSON.deserialize<PurchaseReturnWithDetails>(returnItem);

  if (
    deserializedReturn.status === "COMPLETED" ||
    deserializedReturn.status === "CANCELLED"
  ) {
    return (
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">
            Cannot edit completed or cancelled returns.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">
          Edit Purchase Return {deserializedReturn.returnNumber}
        </h2>
      </div>
      <PurchaseReturnForm
        returnItem={returnItem}
        vendors={vendors.data}
        purchaseOrders={purchaseOrders}
        purchaseInvoices={purchaseInvoices}
      />
    </div>
  );
}
