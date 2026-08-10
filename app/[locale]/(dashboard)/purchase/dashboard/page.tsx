export const dynamic = "force-dynamic";

import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";
import { DashboardView } from "./_components/dashboard-view";
import {
  getDashboardSummary,
  getPurchaseTrends,
  getRecentPurchases,
  getTopSuppliers,
  getTopProducts,
  getOutstandingSummary,
  getOverdueInvoices,
} from "./actions";
import { prisma } from "@/services/lib/prisma";

export default async function PurchaseDashboardPage() {
  const queryClient = new QueryClient();

  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: ["purchase-dashboard-summary"],
      queryFn: async () => {
        const res = await getDashboardSummary();
        return res.success
          ? res.data
          : {
            totalOrders: 0,
            totalPurchases: 0,
            totalPaid: 0,
            outstandingAmount: 0,
          };
      },
    }),
    queryClient.prefetchQuery({
      queryKey: ["purchase-trends"],
      queryFn: async () => {
        const res = await getPurchaseTrends();
        return res.success ? res.data : [];
      },
    }),
    queryClient.prefetchQuery({
      queryKey: ["recent-purchases"],
      queryFn: async () => {
        const res = await getRecentPurchases();
        return res.success ? res.data : [];
      },
    }),
    queryClient.prefetchQuery({
      queryKey: ["purchase-top-suppliers"],
      queryFn: async () => {
        const res = await getTopSuppliers();
        return res.success ? res.data : [];
      },
    }),
    queryClient.prefetchQuery({
      queryKey: ["purchase-top-products"],
      queryFn: async () => {
        const res = await getTopProducts();
        return res.success ? res.data : [];
      },
    }),
    queryClient.prefetchQuery({
      queryKey: ["purchase-outstanding-summary"],
      queryFn: async () => {
        const res = await getOutstandingSummary();
        return res.success ? res.data : [];
      },
    }),
    queryClient.prefetchQuery({
      queryKey: ["purchase-overdue-invoices"],
      queryFn: async () => {
        const res = await getOverdueInvoices();
        return res.success ? res.data : [];
      },
    }),
  ]);

  const companyProfile = await prisma.companyProfile.findFirst();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardView companyProfile={companyProfile} />
    </HydrationBoundary>
  );
}
