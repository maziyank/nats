"use server"

import { prisma } from "@/services/lib/prisma"
import { getSession } from "@/services/lib/auth/auth"
import { hasPermission } from "@/services/lib/permissions/utils"

export interface TaxSummaryEntry {
  id: string
  name: string
  code: string
  rate: number
  inputTax: number
  outputTax: number
  netTax: number
  inputBase: number
  outputBase: number
}

export async function getTaxSummaryReport(startDate: Date, endDate: Date) {
  const session = await getSession()
  if (!session || !hasPermission(session.permissions, "reports.view")) {
    throw new Error("Unauthorized")
  }

  // Fetch Tax Rates
  const taxRates = await prisma.taxRate.findMany()
  
  // Initialize summary map
  const summary = new Map<string, TaxSummaryEntry>()

  // Helper to get or create entry
  const getEntry = (rateId: string | null, manualName = "Manual/Other") => {
    const key = rateId || "manual"
    if (!summary.has(key)) {
      const rate = rateId ? taxRates.find(r => r.id === rateId) : null
      summary.set(key, {
        id: key,
        name: rate ? rate.name : manualName,
        code: rate ? rate.code : "MANUAL",
        rate: rate ? Number(rate.rate) : 0,
        inputTax: 0,
        outputTax: 0,
        netTax: 0,
        inputBase: 0,
        outputBase: 0,
      })
    }
    return summary.get(key)!
  }

  // Fetch Purchase Items (Input Tax)
  const purchaseItems = await prisma.purchaseInvoiceItem.findMany({
    where: {
      purchaseInvoice: {
        invoiceDate: {
          gte: startDate,
          lte: endDate,
        },
        status: { notIn: ["DRAFT", "CANCELED"] },
      }
    },
    include: {
      purchaseInvoice: {
        select: { status: true }
      }
    }
  })

  for (const item of purchaseItems) {
    const tax = Number(item.tax)
    // Even if tax is 0, we might want to track Base Amount if it's Zero Rated/Exempt tax rate.
    // If tax > 0 OR taxRateId is present.
    if (tax === 0 && !item.taxRateId) continue

    const entry = getEntry(item.taxRateId)
    entry.inputTax += tax
    
    const gross = Number(item.totalPrice)
    const base = gross - tax
    entry.inputBase += base
  }

  // Fetch Sales Items (Output Tax)
  const salesItems = await prisma.salesInvoiceItem.findMany({
    where: {
      salesInvoice: {
        invoiceDate: {
          gte: startDate,
          lte: endDate,
        },
        status: { notIn: ["DRAFT", "CANCELLED"] }
      }
    },
    include: {
      salesInvoice: {
        select: { status: true }
      }
    }
  })

  for (const item of salesItems) {
    const tax = Number(item.tax)
    if (tax === 0 && !item.taxRateId) continue

    const entry = getEntry(item.taxRateId)
    entry.outputTax += tax
    
    const gross = Number(item.totalPrice)
    const base = gross - tax
    entry.outputBase += base
  }

  // Calculate Net
  for (const entry of summary.values()) {
    entry.netTax = entry.outputTax - entry.inputTax
  }

  return Array.from(summary.values()).sort((a, b) => a.code.localeCompare(b.code))
}
