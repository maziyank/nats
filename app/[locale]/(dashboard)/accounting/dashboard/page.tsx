import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";
export const dynamic = "force-dynamic";

import { DashboardView } from "./_components/dashboard-view";
import {
  getDashboardSummary,
  getFinancialTrends,
  getExpenseBreakdown,
  getRecentTransactions,
} from "./actions";
import { prisma } from "@/services/lib/prisma";

export default async function AccountingDashboardPage() {
  const queryClient = new QueryClient();

  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: ["dashboard-summary"],
      queryFn: async () => {
        const res = await getDashboardSummary();
        return res.success
          ? res.data
          : {
            totalRevenue: 0,
            totalExpenses: 0,
            netIncome: 0,
            accountsReceivable: 0,
            accountsPayable: 0,
          };
      },
    }),
    queryClient.prefetchQuery({
      queryKey: ["financial-trends"],
      queryFn: async () => {
        const res = await getFinancialTrends();
        return res.success ? res.data : [];
      },
    }),
    queryClient.prefetchQuery({
      queryKey: ["expense-breakdown"],
      queryFn: async () => {
        const res = await getExpenseBreakdown();
        return res.success ? res.data : [];
      },
    }),
    queryClient.prefetchQuery({
      queryKey: ["recent-transactions"],
      queryFn: async () => {
        const res = await getRecentTransactions();
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
