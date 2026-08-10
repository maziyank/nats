"use server";

import { serverRegistry } from "@/services/lib/reporting/server-registry";
import { prisma } from "@/services/lib/prisma";
import { getSession } from "@/services/lib/auth/auth";
import { SuperJSON } from "@/services/lib/superjson";
import { ReportFormat } from "@/services/lib/reporting/types";
import { getTranslations } from "next-intl/server";

export async function getReportData(code: string, input: any) {
  const startTime = Date.now();
  try {
    const session = await getSession();
    if (!session) {
      throw new Error("Unauthorized");
    }

    const reportDef = serverRegistry[code as keyof typeof serverRegistry];
    if (!reportDef) {
      throw new Error(`Report with code ${code} not found`);
    }

    // Fetch Data
    const data = await reportDef.fetchData(input);

    // Fetch Translations based on code
    let translations = {};
    try {
      if (code.startsWith("POS_")) {
        const t = await getTranslations("POS");
        // Convert to a plain object for serialization
        // We only pick some common keys or all if it's small
        // For POS, let's get all POS keys
        const keys = [
          "pos_receipt",
          "cashier",
          "customer",
          "walk_in_customer",
          "subtotal",
          "discount",
          "total",
          "paid_via",
          "thank_you",
          "come_again",
          "invoice",
          "date",
        ];
        const transObj: Record<string, string> = {};
        keys.forEach((key) => {
          transObj[key] = t(key);
        });
        translations = transObj;
      } else {
        const t = await getTranslations("Common");
        const keys = [
          "date",
          "amount",
          "description",
          "total",
          "quantity",
          "price",
        ];
        const transObj: Record<string, string> = {};
        keys.forEach((key) => {
          transObj[key] = t(key);
        });
        translations = transObj;
      }
    } catch (e) {
      console.warn("Failed to fetch translations for report", e);
    }

    // Fetch Context Info
    const companyProfile = await prisma.companyProfile.findFirst();
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    });

    // Fetch Template Config from DB
    const reportTemplate = await prisma.reportTemplate.findUnique({
      where: { code },
    });

    const config = {
      ...((reportTemplate?.config as Record<string, any>) || {}),
    };

    const context = {
      data,
      user: {
        name: user?.name || "Unknown User",
        email: user?.email || "",
      },
      company: {
        name: companyProfile?.name || "My Company",
        address: companyProfile?.address || "",
        phone: companyProfile?.phone || "",
        email: companyProfile?.email || "",
        website: companyProfile?.website || "",
        dateFormat: companyProfile?.dateFormat || "MMM dd, yyyy",
        currency: companyProfile?.currency || "USD",
        currencySymbol: companyProfile?.currencySymbol || "$",
        currencyFormat: companyProfile?.currencyFormat || "standard",
        locale: companyProfile?.locale || "en-US",
      },
      config,
      translations,
    };

    // Log success
    // We do this asynchronously or just await it.
    // Since this is a server action, awaiting is safer.
    if (reportTemplate) {
      await prisma.reportLog.create({
        data: {
          templateId: reportTemplate.id,
          userId: session.userId,
          status: "SUCCESS",
          format: "PDF", // Defaulting to PDF for now as that's what we primarily support
          parameters: input,
          executionTimeMs: Date.now() - startTime,
        },
      });
    }

    return { success: true, data: SuperJSON.serialize(context) };
  } catch (error: any) {
    console.error("Report Generation Error:", error);

    // Try to log failure if we have a session
    try {
      const session = await getSession();
      if (session) {
        const reportTemplate = await prisma.reportTemplate.findUnique({
          where: { code },
        });
        if (reportTemplate) {
          await prisma.reportLog.create({
            data: {
              templateId: reportTemplate.id,
              userId: session.userId,
              status: "FAILED",
              format: "PDF",
              parameters: input,
              executionTimeMs: Date.now() - startTime,
              errorMessage: error.message,
            },
          });
        }
      }
    } catch (logError) {
      // Ignore log error
    }

    return { success: false, error: error.message };
  }
}
