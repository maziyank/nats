"use server"

import { prisma } from "@/services/lib/prisma"
import { TaxRate } from "@/prisma/generated/prisma/client"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const taxRateSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  rate: z.coerce.number().min(0, "Rate must be positive"),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
})

export type TaxRateFormData = z.infer<typeof taxRateSchema>

export async function getTaxRates() {
  const taxRates = await prisma.taxRate.findMany({
    orderBy: { code: "asc" },
  })
  // Serialize Decimal
  return JSON.parse(JSON.stringify(taxRates)) as TaxRate[]
}

export async function createTaxRate(data: TaxRateFormData) {
  try {
    const validated = taxRateSchema.parse(data)
    await prisma.taxRate.create({
      data: validated,
    })
    revalidatePath("/accounting/configuration/taxes")
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, error: "Failed to create tax rate" }
  }
}

export async function updateTaxRate(id: string, data: TaxRateFormData) {
  try {
    const validated = taxRateSchema.parse(data)
    await prisma.taxRate.update({
      where: { id },
      data: validated,
    })
    revalidatePath("/accounting/configuration/taxes")
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, error: "Failed to update tax rate" }
  }
}
