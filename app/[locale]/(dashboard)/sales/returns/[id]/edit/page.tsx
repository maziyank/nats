export const dynamic = "force-dynamic";

import {
  getSalesReturn,
  getSalesOrdersForReturn,
  getSalesInvoicesForReturn,
} from "../../actions";
import { getContacts } from "@/app/[locale]/(dashboard)/general/contacts/actions";
import { ContactType } from "@/prisma/generated/prisma/enums";
import { SalesReturnForm } from "../../_components/sales-return-form";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { SuperJSON } from "@/services/lib/superjson";
import { SalesReturnWithDetails } from "../../types";

export const metadata: Metadata = {
  title: "Edit Sales Return | NATS",
  description: "Edit sales return details",
};

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditSalesReturnPage(props: PageProps) {
  const params = await props.params;
  const [returnItem, customers, salesOrders, salesInvoices] =
    await Promise.all([
      getSalesReturn(params.id),
      getContacts({ type: ContactType.CUSTOMER }),
      getSalesOrdersForReturn(),
      getSalesInvoicesForReturn(),
    ]);

  if (!returnItem) {
    notFound();
  }

  const deserializedReturn =
    SuperJSON.deserialize<SalesReturnWithDetails>(returnItem);

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
    <SalesReturnForm
      returnItem={returnItem}
      customers={customers.data}
      salesOrders={salesOrders}
      salesInvoices={salesInvoices}
    />
  );
}
