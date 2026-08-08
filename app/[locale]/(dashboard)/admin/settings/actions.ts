"use server";

import { prisma } from "@/lib/prisma";
import { authorizedAction } from "@/lib/permissions/protected-action";
import { revalidatePath } from "next/cache";
import { z } from "zod";

interface CompanyProfileData {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  taxId?: string | null;
  currency: string;
  currencySymbol: string;
  dateFormat: string;
  currencyFormat: string;
  locale: string;
  timezone: string;
}

const companyProfileSchema = z.object({
  name: z.string().min(1, "Company name is required"),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z
    .string()
    .nullable()
    .optional()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Invalid email"),
  website: z.string().nullable().optional(),
  taxId: z.string().nullable().optional(),
  currency: z.string().min(1, "Currency is required"),
  currencySymbol: z.string().min(1, "Currency symbol is required"),
  dateFormat: z.string().min(1, "Date format is required"),
  currencyFormat: z.string().min(1, "Currency format is required"),
  locale: z.string().min(1, "Locale is required"),
  timezone: z.string().min(1, "Timezone is required"),
});

/**
 * Update company profile settings.
 * Permission: "company.settings"
 *
 * @param data - The company profile data
 * @returns    - Success flag or error
 */
export const updateCompanyProfile = authorizedAction(
  "company.settings",
  async (data: CompanyProfileData) => {
    const parsed = companyProfileSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    if (!data.name) {
      return { success: false, error: "Company name is required" };
    }

    const existingProfile = await prisma.companyProfile.findFirst();

    if (existingProfile) {
      await prisma.companyProfile.update({
        where: { id: existingProfile.id },
        data: {
          name: data.name,
          address: data.address,
          phone: data.phone,
          email: data.email,
          website: data.website,
          taxId: data.taxId,
          currency: data.currency,
          currencySymbol: data.currencySymbol,
          dateFormat: data.dateFormat,
          currencyFormat: data.currencyFormat,
          locale: data.locale,
          timezone: data.timezone,
        },
      });
    } else {
      await prisma.companyProfile.create({
        data: {
          name: data.name,
          address: data.address,
          phone: data.phone,
          email: data.email,
          website: data.website,
          taxId: data.taxId,
          currency: data.currency,
          currencySymbol: data.currencySymbol,
          dateFormat: data.dateFormat,
          currencyFormat: data.currencyFormat,
          locale: data.locale,
          timezone: data.timezone,
        },
      });
    }

    revalidatePath("/", "layout"); // Revalidate everything as this affects global layout
    return { success: true };
  }
);

export const getCompanyProfile = async () => {
  return prisma.companyProfile.findFirst({
    select: {
      name: true,
      address: true,
      phone: true,
      email: true,
      website: true,
      taxId: true,
      currency: true,
      currencySymbol: true,
      dateFormat: true,
      currencyFormat: true,
      locale: true,
      timezone: true,
    },
  });
};
