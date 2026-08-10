import { Decimal } from "decimal.js";
import { Discount, DiscountType } from "@/prisma/generated/prisma/client";

export function calculateDiscountedPrice(price: Decimal, discounts: Discount[]): Decimal {
    if (!discounts || discounts.length === 0) {
        return price;
    }

    // Sort discounts by priority (descending)
    const sortedDiscounts = [...discounts].sort((a, b) => b.priority - a.priority);

    // Apply highest priority discount
    // Note: This logic assumes only one discount applies at a time for now.
    // If stacking is needed, we would iterate. 
    // For this implementation, we take the highest priority active discount.

    const discount = sortedDiscounts[0];
    const now = new Date();

    if (!discount.isActive) return price;
    if (discount.startDate > now) return price;
    if (discount.endDate && discount.endDate < now) return price;

    let finalPrice = price;

    if (discount.type === "PERCENTAGE") {
        const discountAmount = price.mul(discount.value).div(100);
        finalPrice = price.minus(discountAmount);
    } else if (discount.type === "FIXED_AMOUNT") {
        finalPrice = price.minus(discount.value);
    }

    // Ensure price doesn't go below zero
    if (finalPrice.isNegative()) {
        return new Decimal(0);
    }

    return finalPrice;
}
