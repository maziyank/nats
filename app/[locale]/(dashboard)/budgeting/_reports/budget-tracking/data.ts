import { prisma } from "@/services/lib/prisma";
import { getBudgetVariance } from "@/app/[locale]/(dashboard)/budgeting/actions";
import { ActionResponse } from "@/types/actions";
import { SuperJSON } from "@/services/lib/superjson";
import { SuperJSONResult } from "superjson";

export async function fetchBudgetTrackingData(input: { fiscalYear?: number }) {

  const fiscalYear = input.fiscalYear || new Date().getFullYear();

  const budgets = await prisma.budget.findMany({
    where: { fiscalYear },
    include: {
      department: true,
      project: true,
      items: { include: { account: true } }
    }
  });

  const reportData = await Promise.all(budgets.map(async (budget) => {
    // Reuse existing variance logic per budget
    const varianceResponse = await getBudgetVariance(budget.id);
    const varianceItems =
      varianceResponse.success && varianceResponse.data
        ? SuperJSON.deserialize<any[]>(varianceResponse.data)
        : [];

    // itemsTotal calculation
    const itemsTotal = varianceItems.reduce((sum: any, item: any) => sum + Number(item.budgeted), 0);
    const totalBudget = budget.totalAmount.toNumber() > 0
      ? budget.totalAmount.toNumber()
      : itemsTotal;

    const totalActual = varianceItems.reduce((sum: any, item: any) => sum + Number(item.actual), 0);

    return {
      id: budget.id,
      name: budget.name,
      department: budget.department?.name,
      project: budget.project?.name,
      isDefault: budget.isDefault,
      totalBudget,
      totalActual,
      variance: totalBudget - totalActual,
      percentage: totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0,
      items: varianceItems
    };
  }));

  return {
    fiscalYear,
    budgets: reportData
  };
}
