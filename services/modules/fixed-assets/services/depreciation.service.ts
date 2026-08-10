import { prisma } from "@/services/lib/prisma";
import { Decimal } from "decimal.js";
import { enqueueIntegrationEvent } from "@/services/modules/integration/outbox";
import { JournalService } from "@/services/modules/accounting/services/journal.service";
import { DepreciationSchedule } from "@/prisma/generated/prisma/client";
import { generateDocumentNumber } from "@/services/lib/document-numbering";
import { requiredIdSchema } from "@/services/lib/validation/schemas";

export class DepreciationService {
  /**
   * Calculate depreciation schedule for an asset (Pure function logic)
   */
  static calculateDepreciationSchedule(
    cost: Decimal,
    residualValue: Decimal,
    usefulLifeMonths: number,
    method:
      | "STRAIGHT_LINE"
      | "DECLINING_BALANCE"
      | "DOUBLE_DECLINING_BALANCE"
      | "UNITS_OF_PRODUCTION"
      | "NO_DEPRECIATION",
    startDate: Date,
  ): { date: Date; amount: Decimal; bookValueAfter: Decimal }[] {
    const schedule: { date: Date; amount: Decimal; bookValueAfter: Decimal }[] =
      [];
    let currentBookValue = cost;
    const depreciableAmount = cost.minus(residualValue);

    if (method === "NO_DEPRECIATION" || usefulLifeMonths <= 0) {
      return [];
    }

    if (method === "STRAIGHT_LINE") {
      const monthlyDepreciation = depreciableAmount.div(usefulLifeMonths);

      for (let i = 1; i <= usefulLifeMonths; i++) {
        const date = new Date(startDate);
        date.setMonth(date.getMonth() + i);

        // Handle last month adjustment to match residual value exactly
        let amount = monthlyDepreciation;
        if (i === usefulLifeMonths) {
          amount = currentBookValue.minus(residualValue);
        }

        // Ensure we don't go below residual value
        if (currentBookValue.minus(amount).lessThan(residualValue)) {
          amount = currentBookValue.minus(residualValue);
        }

        if (amount.lessThanOrEqualTo(0)) break;

        currentBookValue = currentBookValue.minus(amount);

        schedule.push({
          date,
          amount,
          bookValueAfter: currentBookValue,
        });
      }
    } else if (method === "DOUBLE_DECLINING_BALANCE") {
      const rate = new Decimal(2).div(usefulLifeMonths);

      for (let i = 1; i <= usefulLifeMonths; i++) {
        const date = new Date(startDate);
        date.setMonth(date.getMonth() + i);

        let amount = currentBookValue.times(rate);

        if (currentBookValue.minus(amount).lessThan(residualValue)) {
          amount = currentBookValue.minus(residualValue);
        }

        if (amount.lessThanOrEqualTo(0)) break;

        currentBookValue = currentBookValue.minus(amount);

        schedule.push({
          date,
          amount,
          bookValueAfter: currentBookValue,
        });
      }
    }

    return schedule;
  }

  static async postDepreciation(
    scheduleId: string,
    userId: string,
  ): Promise<void> {
    requiredIdSchema.parse(scheduleId);
    requiredIdSchema.parse(userId);
    const schedule = await prisma.depreciationSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        asset: {
          include: {
            category: true,
          },
        },
      },
    });

    if (!schedule) throw new Error("Schedule not found");
    if (schedule.isPosted) throw new Error("Already posted");

    const { asset, amount, date } = schedule;
    const { category } = asset;

    await prisma.$transaction(async (tx) => {
      const entryNumber = await generateDocumentNumber(
        "DEPRECIATION_JOURNAL",
        "Depreciation Journal",
        "DEP",
      );
      // Create Journal Entry
      const je = await JournalService.createJournalEntry(
        {
          entryNumber,
          transactionDate: date,
          description: `Depreciation for ${asset.name} (${asset.code})`,
          lines: [
            {
              accountId: category.depreciationExpenseAccountId,
              debitAmount: new Decimal(amount).toNumber(),
              creditAmount: 0,
              description: "Depreciation Expense",
            },
            {
              accountId: category.accumDepreciationAccountId,
              debitAmount: 0,
              creditAmount: new Decimal(amount).toNumber(),
              description: "Accumulated Depreciation",
            },
          ],
        },
        userId,
        tx,
      );

      await JournalService.postJournalEntry(je.id, tx);

      // Update Schedule
      await tx.depreciationSchedule.update({
        where: { id: scheduleId },
        data: {
          isPosted: true,
          postedAt: new Date(),
          journalEntryId: je.id,
        },
      });

      // Update Asset Current Book Value
      await tx.asset.update({
        where: { id: asset.id },
        data: {
          currentBookValue: schedule.bookValueAfter,
        },
      });

      // Emit Event
      await enqueueIntegrationEvent(tx, {
        topic: "fixed-assets",
        type: "DEPRECIATION_POSTED",
        aggregateType: "ASSET",
        aggregateId: asset.id,
        payload: {
          scheduleId: schedule.id,
          assetId: asset.id,
          amount: amount.toString(),
          date: date.toISOString(),
          userId: userId,
        },
      });
    });
  }

  static async getDueDepreciationSchedules(): Promise<DepreciationSchedule[]> {
    const today = new Date();
    return await prisma.depreciationSchedule.findMany({
      where: {
        isPosted: false,
        date: { lte: today },
        asset: { status: "ACTIVE" },
      },
      include: {
        asset: {
          include: { category: true },
        },
      },
      orderBy: { date: "asc" },
    });
  }
}
