export const dynamic = "force-dynamic";

import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";
import { DashboardView } from "./_components/dashboard-view";
import {
  getDashboardSummary,
  getSalesTrends,
  getRecentSales,
  getTopCustomers,
  getTopProducts,
  getOutstandingSummary,
  getOverdueInvoices,
} from "./actions";
import { prisma } from "@/services/lib/prisma";

export default async function SalesDashboardPage() {
  const queryClient = new QueryClient();

  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: ["sales-dashboard-summary"],
      queryFn: async () => {
        const res = await getDashboardSummary();
        return res.success
          ? res.data
          : {
            totalOrders: 0,
            totalSales: 0,
            totalReceived: 0,
            outstandingAmount: 0,
          };
      },
    }),
    queryClient.prefetchQuery({
      queryKey: ["sales-trends"],
      queryFn: async () => {
        const res = await getSalesTrends();
        return res.success ? res.data : [];
      },
    }),
    queryClient.prefetchQuery({
      queryKey: ["recent-sales"],
      queryFn: async () => {
        const res = await getRecentSales();
        return res.success ? res.data : [];
      },
    }),
    queryClient.prefetchQuery({
      queryKey: ["sales-top-customers"],
      queryFn: async () => {
        const res = await getTopCustomers();
        return res.success ? res.data : [];
      },
    }),
    queryClient.prefetchQuery({
      queryKey: ["sales-top-products"],
      queryFn: async () => {
        const res = await getTopProducts();
        return res.success ? res.data : [];
      },
    }),
    queryClient.prefetchQuery({
      queryKey: ["sales-outstanding-summary"],
      queryFn: async () => {
        const res = await getOutstandingSummary();
        return res.success ? res.data : [];
      },
    }),
    queryClient.prefetchQuery({
      queryKey: ["sales-overdue-invoices"],
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
