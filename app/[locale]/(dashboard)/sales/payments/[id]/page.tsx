export const dynamic = "force-dynamic";

import { getSalesPayment } from "../actions";
import { SalesPaymentForm } from "../_components/sales-payment-form";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { SuperJSON } from "@/services/lib/superjson";
import { SalesPaymentWithDetails } from "../types";

export const metadata: Metadata = {
  title: "View Sales Payment | NATS",
  description: "View sales payment details",
};

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ViewSalesPaymentPage(props: PageProps) {
  const params = await props.params;
  const paymentData = await getSalesPayment(params.id);

  if (!paymentData) {
    notFound();
  }

  const payment = SuperJSON.deserialize<SalesPaymentWithDetails>(paymentData);

  return <SalesPaymentForm initialData={payment} readonly />;
}
