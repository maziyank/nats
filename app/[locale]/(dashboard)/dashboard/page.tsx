export const dynamic = "force-dynamic";

import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";
import { prisma } from "@/services/lib/prisma";
import { redirect } from "next/navigation";
import { getMainDashboardStats } from "./actions";
import { DashboardView } from "./_components/dashboard-view";

export default async function Page() {
  const companyProfile = await prisma.companyProfile.findFirst();

  if (!companyProfile) {
    redirect("/setup");
  }

  const queryClient = new QueryClient();

  await queryClient.prefetchQuery({
    queryKey: ["main-dashboard"],
    queryFn: () => getMainDashboardStats(),
  });

  return (
    <div className="container mx-auto px-4">
      <HydrationBoundary state={dehydrate(queryClient)}>
        <DashboardView />
      </HydrationBoundary>
    </div>
  );
}
