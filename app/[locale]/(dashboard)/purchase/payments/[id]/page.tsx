export const dynamic = "force-dynamic";

import { getPurchasePayment } from "../actions";
import { PurchasePaymentForm } from "../_components/purchase-payment-form";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { SuperJSON } from "@/services/lib/superjson";
import { PurchasePaymentWithDetails } from "../types";
import { getDepartments, getProjects } from "@/app/[locale]/(dashboard)/accounting/journal-entries/actions";

export const metadata: Metadata = {
  title: "View Purchase Payment | NATS",
  description: "View purchase payment details",
};

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ViewPurchasePaymentPage(props: PageProps) {
  const params = await props.params;
  const paymentData = await getPurchasePayment(params.id);
  const departments = await getDepartments();
  const projects = await getProjects();

  if (!paymentData) {
    notFound();
  }

  const payment = SuperJSON.deserialize<PurchasePaymentWithDetails>(paymentData);

  return (
    <PurchasePaymentForm
      initialData={payment}
      readonly
      departments={departments}
      projects={projects}
    />
  );
}
