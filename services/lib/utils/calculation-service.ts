import { Decimal } from "decimal.js";

export interface LineItemInput {
  quantity: number | Decimal;
  unitPrice: number | Decimal;
  /** Discount percentage (0–100), not a fixed amount. */
  discount?: number | Decimal;
  /** Pre-computed tax amount (ignored when taxRatePercentage is provided). */
  tax?: number | Decimal;
  taxRateId?: string;
}

export interface LineItemResult {
  subtotal: Decimal;
  discountAmount: Decimal;
  taxableAmount: Decimal;
  taxAmount: Decimal;
  total: Decimal;
}

export interface InvoiceTotals {
  itemsTotal: Decimal;
  totalTax: Decimal;
  totalAmount: Decimal;
}

export class CalculationService {
  /**
   * Calculates details for a single line item.
   * 
   * @param item - The line item with quantity, price, discount (%), and tax (amount)
   * @param taxRatePercentage - Optional tax rate percentage to calculate tax if not provided as amount
   */
  static calculateLineItem(item: LineItemInput, taxRatePercentage?: number | Decimal): LineItemResult {
    const quantity = new Decimal(item.quantity || 0);
    const unitPrice = new Decimal(item.unitPrice || 0);
    const discountPercent = new Decimal(item.discount || 0);
    
    const subtotal = unitPrice.mul(quantity);
    const discountAmount = subtotal.mul(discountPercent.div(100));
    const taxableAmount = Decimal.max(0, subtotal.minus(discountAmount));
    
    let taxAmount = new Decimal(item.tax || 0);
    
    if (taxRatePercentage) {
      const rate = new Decimal(taxRatePercentage);
      taxAmount = taxableAmount.mul(rate.div(100));
    }
    
    // Round tax to 2 decimal places for storage/display consistency.
    taxAmount = new Decimal(taxAmount.toFixed(2));
    
    const total = taxableAmount.plus(taxAmount);

    return {
      subtotal,
      discountAmount,
      taxableAmount,
      taxAmount,
      total
    };
  }

  /**
   * Calculates totals for an invoice (Sales or Purchase).
   * 
   * @param items - Array of calculated line items
   * @param globalDiscount - Fixed amount discount applied to the GROSS total (Post-Tax).
   *                         Note: This is treated as a "Payment/Cash Discount" (e.g., Voucher), 
   *                         NOT a "Trade Discount". It does not reduce the taxable basis.
   * @param shippingCost - Shipping cost added to total
   * @param handlingCost - Handling cost added to total
   */
  static calculateInvoiceTotals(
    items: LineItemResult[],
    globalDiscount: number | Decimal = 0,
    shippingCost: number | Decimal = 0,
    handlingCost: number | Decimal = 0
  ): InvoiceTotals {
    const itemsTotal = items.reduce((sum, item) => sum.plus(item.total), new Decimal(0));
    const totalTax = items.reduce((sum, item) => sum.plus(item.taxAmount), new Decimal(0));
    
    // Global discount is usually a fixed amount subtracted from total
    const globalDisc = new Decimal(globalDiscount);
    const shipping = new Decimal(shippingCost);
    const handling = new Decimal(handlingCost);
    
    // Logic: Total = ItemsTotal - GlobalDiscount + Shipping + Handling
    // This implies Global Discount is applied to the Gross Total (Post-Tax).
    
    const totalAmount = itemsTotal.minus(globalDisc).plus(shipping).plus(handling);

    return {
      itemsTotal,
      totalTax,
      totalAmount
    };
  }
}
