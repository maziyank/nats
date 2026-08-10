export const dynamic = "force-dynamic";

import {
  getPurchaseReturn,
  getPurchaseOrdersForReturn,
  getPurchaseInvoicesForReturn,
} from "../actions";
import { getContacts } from "@/app/[locale]/(dashboard)/general/contacts/actions";
import { ContactType } from "@/prisma/generated/prisma/enums";
import { PurchaseReturnForm } from "../_components/purchase-return-form";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { SuperJSON } from "@/services/lib/superjson";
import { PurchaseReturnWithDetails } from "../types";
import { getDepartments, getProjects } from "@/app/[locale]/(dashboard)/general/actions";
import { SuperJSONResult } from "superjson";

export const metadata: Metadata = {
  title: "View Purchase Return | NATS",
  description: "View purchase return details",
};

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ViewPurchaseReturnPage(props: PageProps) {
  const params = await props.params;
  const [returnItem, vendors, purchaseOrders, purchaseInvoices, departments, projects] =
    await Promise.all([
      getPurchaseReturn(params.id),
      getContacts({ type: ContactType.VENDOR }),
      getPurchaseOrdersForReturn(),
      getPurchaseInvoicesForReturn(),
      getDepartments(),
      getProjects(),
    ]);

  if (!returnItem) {
    notFound();
  }

  const deserializedReturn =
    SuperJSON.deserialize<PurchaseReturnWithDetails>(returnItem);

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">
          Purchase Return {deserializedReturn.returnNumber}
        </h2>
      </div>
      <PurchaseReturnForm
        returnItem={returnItem}
        vendors={vendors.data}
        purchaseOrders={purchaseOrders as unknown as SuperJSONResult}
        purchaseInvoices={purchaseInvoices as unknown as SuperJSONResult}
        departments={departments}
        projects={projects.projects}
        readonly
      />
    </div>
  );
}
