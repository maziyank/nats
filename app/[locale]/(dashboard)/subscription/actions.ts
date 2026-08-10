"use server";

import { verifySession } from "@/services/lib/auth/auth";
import { prisma } from "@/services/lib/prisma";
import { serializePrisma } from "@/services/lib/prisma";

export async function getSubscriptionData() {
    const session = await verifySession();

    const companyProfile = await prisma.companyProfile.findFirst();

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const monthlyTransactions = await prisma.tenantTransactionMonthly.findUnique({
        where: { yearMonth },
    });

    return serializePrisma({
        subscription: "PREMIUM",
        subscriptionStart: new Date(),
        subscriptionEnd: new Date(new Date().setFullYear(new Date().getFullYear() + 100)), // 100 years from now (lifetime)
        tenantName: companyProfile?.name || "Standalone ERP",
        paymentHistory: [],
        monthlyUsage: monthlyTransactions?.count || 0,
        monthlyLimit: "Unlimited",
    });
}
