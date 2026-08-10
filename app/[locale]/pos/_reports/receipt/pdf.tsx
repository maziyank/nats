import React from "react";
import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { ReportContext } from "@/services/lib/reporting/types";
import { POSReceiptData } from "./data";
import { formatCurrency, formatDate } from "@/services/lib/utils";

// 80mm thermal paper width is approx 226 points (80mm * 2.83)
// 58mm thermal paper width is approx 164 points
// We'll design for 80mm by default but keep it responsive-ish

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    padding: 10,
    fontSize: 9,
    fontFamily: "Helvetica",
    width: "100%", // Will be constrained by page size
  },
  center: { textAlign: "center", alignItems: "center" },
  header: {
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    borderStyle: "dashed",
    paddingBottom: 5,
  },
  companyName: { fontSize: 12, fontWeight: "bold", marginBottom: 2 },
  companyInfo: { fontSize: 8, marginBottom: 1 },
  title: { fontSize: 10, fontWeight: "bold", marginTop: 5, marginBottom: 2 },
  meta: { fontSize: 8, marginBottom: 5 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  itemRow: { flexDirection: "row", marginBottom: 2, flexWrap: "wrap" },
  itemDesc: { width: "100%", marginBottom: 1, fontWeight: "bold" },
  itemDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingLeft: 5,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    borderStyle: "dashed",
    marginVertical: 5,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
    fontWeight: "bold",
  },
  footer: { marginTop: 10, textAlign: "center", fontSize: 8 },
});

export const POSReceiptPdf = ({
  data,
  company,
  config,
  translations = {},
}: ReportContext<POSReceiptData>) => {
  const { invoice, payment, cashierName } = data;
  const t = (key: string) => translations[key] || key;

  const currencyOptions = {
    currency: company.currency,
    currencySymbol: company.currencySymbol,
    currencyFormat: company.currencyFormat,
    locale: company.locale,
  };
  const dateOptions = {
    dateFormat: company.dateFormat,
    includeTime: true,
  };

  // --- Dynamic Height Calculation ---
  // Approximate heights in points (pt)
  const PADDING_V = 20; // 10 top + 10 bottom

  // Header: Name(14) + Info(10*2) + Title(17) + Meta(10*2) + Padding(15) ~ 86
  // We add a bit of buffer for wrapping text in address
  const HEADER_H = 100;

  // Cashier/Customer: 2 rows(11*2) + margin(5) ~ 27
  const META_H = 30;

  // Divider: 11 * 3 dividers = 33
  const DIVIDER_H = 11;

  // Totals: Subtotal(11) + Total(14) + Margin ~ 30. Optional Discount(11).
  const TOTALS_H = 30 + (Number(invoice.globalDiscount) > 0 ? 11 : 0);

  // Payment: 1 row(11) ~ 11
  const PAYMENT_H = 15;

  // Footer: ~40
  const FOOTER_H = 40;

  // Items calculation
  // Each item: Description + Details line + margin
  // We estimate description wrapping. 80mm width ~ 45 chars per line for 9pt font.
  const CHARS_PER_LINE = 45;
  const ITEM_BASE_H = 15; // Details line + margins
  const LINE_H = 10; // Description line height

  const itemsHeight = invoice.items.reduce((acc: number, item: any) => {
    const text = item.description || item.product?.name || "";
    const lines = Math.ceil((text.length || 1) / CHARS_PER_LINE);
    return acc + lines * LINE_H + ITEM_BASE_H;
  }, 0);

  const dynamicHeight =
    PADDING_V +
    HEADER_H +
    META_H +
    DIVIDER_H * 3 +
    itemsHeight +
    TOTALS_H +
    PAYMENT_H +
    FOOTER_H +
    5; // Extra buffer

  // Default to 80mm width if not specified
  const pageSize =
    config.pageSize === "A4" || !config.pageSize
      ? [226, dynamicHeight]
      : [config.pageSize[0], dynamicHeight];

  return (
    <Document>
      <Page size={pageSize as any} style={styles.page}>
        {/* Header */}
        <View style={[styles.header, styles.center]}>
          <Text style={styles.companyName}>{company.name}</Text>
          <Text style={styles.companyInfo}>{company.address}</Text>
          <Text style={styles.companyInfo}>{company.phone}</Text>

          <Text style={styles.title}>{t("pos_receipt").toUpperCase()}</Text>
          <Text style={styles.meta}>#{invoice.invoiceNumber}</Text>
          <Text style={styles.meta}>
            {formatDate(invoice.invoiceDate, dateOptions)}
          </Text>
        </View>

        {/* Cashier/Customer Info */}
        <View style={{ marginBottom: 5 }}>
          <View style={styles.row}>
            <Text>{t("cashier")}:</Text>
            <Text>{cashierName || "System"}</Text>
          </View>
          <View style={styles.row}>
            <Text>{t("customer")}:</Text>
            <Text>{invoice.contact?.name || t("walk_in_customer")}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Items */}
        <View>
          {invoice.items.map((item: any) => (
            <View key={item.id} style={{ marginBottom: 4 }}>
              <Text style={styles.itemDesc}>
                {item.description || item.product?.name}
              </Text>
              <View style={styles.itemDetails}>
                <Text>
                  {item.quantity} x{" "}
                  {formatCurrency(item.unitPrice, currencyOptions)}
                </Text>
                <Text>{formatCurrency(item.totalPrice, currencyOptions)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.divider} />

        {/* Totals */}
        <View>
          <View style={styles.row}>
            <Text>{t("subtotal")}</Text>
            <Text>{formatCurrency(invoice.subtotal, currencyOptions)}</Text>
          </View>
          {Number(invoice.globalDiscount) > 0 && (
            <View style={styles.row}>
              <Text>{t("discount")}</Text>
              <Text>
                -{formatCurrency(invoice.globalDiscount, currencyOptions)}
              </Text>
            </View>
          )}
          <View style={[styles.totalRow, { marginTop: 3, fontSize: 11 }]}>
            <Text>{t("total").toUpperCase()}</Text>
            <Text>{formatCurrency(invoice.totalAmount, currencyOptions)}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Payment Info */}
        {payment && (
          <View>
            <View style={styles.row}>
              <Text>
                {t("paid_via")
                  .replace("{amount}", "")
                  .replace("{method}", payment.method)
                  .trim()}
              </Text>
              <Text>{formatCurrency(payment.amount, currencyOptions)}</Text>
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text>{t("thank_you")}</Text>
          <Text>{t("come_again")}</Text>
          {company.email && (
            <Text style={{ marginTop: 2 }}>{company.email}</Text>
          )}
          {company.website && (
            <Text style={{ marginTop: 2 }}>{company.website}</Text>
          )}
        </View>
      </Page>
    </Document>
  );
};
