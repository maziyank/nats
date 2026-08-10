import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { ReportContext } from "@/services/lib/reporting/types";
import { fetchBudgetTrackingData } from "./data";
import { formatCurrency } from "@/services/lib/utils";

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 10, fontFamily: "Helvetica" },
  header: { marginBottom: 20 },
  title: { fontSize: 18, marginBottom: 5, fontWeight: "bold" },
  subtitle: { fontSize: 12, color: "#666" },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 12, marginBottom: 5, fontWeight: "bold", backgroundColor: "#f0f0f0", padding: 5 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 5 },
  headerRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#000", paddingVertical: 5, fontWeight: "bold" },
  colName: { width: "40%" },
  colNum: { width: "20%", textAlign: "right" },
  totalRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#000", marginTop: 5, paddingTop: 5, fontWeight: "bold" }
});

export function BudgetTrackingPdf({ data, company }: ReportContext<Awaited<ReturnType<typeof fetchBudgetTrackingData>>>) {
  const currencyOptions = {
    currency: company.currency,
    currencySymbol: company.currencySymbol,
    currencyFormat: company.currencyFormat,
    locale: company.locale,
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Budget Tracking Report</Text>
          <Text style={styles.subtitle}>Fiscal Year: {data.fiscalYear}</Text>
        </View>

        {data.budgets.map((budget) => (
          <View key={budget.id} style={styles.section}>
            <Text style={styles.sectionTitle}>
              {budget.name}
              {budget.isDefault ? " (Default/Global)" : ""}
              {budget.department ? ` • Dept: ${budget.department}` : ""}
              {budget.project ? ` • Proj: ${budget.project}` : ""}
            </Text>

            <View style={styles.headerRow}>
              <Text style={styles.colName}>Account</Text>
              <Text style={styles.colNum}>Budgeted</Text>
              <Text style={styles.colNum}>Actual</Text>
              <Text style={styles.colNum}>Variance</Text>
            </View>

            {budget.items.length === 0 ? (
              <Text style={{ padding: 10, color: "#666" }}>No line items defined.</Text>
            ) : (
              budget.items.map((item) => (
                <View key={item.accountId} style={styles.row}>
                  <Text style={styles.colName}>{item.accountName} ({item.accountCode})</Text>
                  <Text style={styles.colNum}>{formatCurrency(item.budgeted, currencyOptions)}</Text>
                  <Text style={styles.colNum}>{formatCurrency(item.actual, currencyOptions)}</Text>
                  <Text style={styles.colNum}>{formatCurrency(item.variance, currencyOptions)}</Text>
                </View>
              ))
            )}

            <View style={styles.totalRow}>
              <Text style={styles.colName}>Total</Text>
              <Text style={styles.colNum}>{formatCurrency(budget.totalBudget, currencyOptions)}</Text>
              <Text style={styles.colNum}>{formatCurrency(budget.totalActual, currencyOptions)}</Text>
              <Text style={styles.colNum}>{formatCurrency(budget.variance, currencyOptions)}</Text>
            </View>
            <Text style={{ marginTop: 5, textAlign: 'right' }}>Utilization: {budget.percentage.toFixed(1)}%</Text>
          </View>
        ))}

        {data.budgets.length === 0 && (
          <Text style={{ textAlign: "center", marginTop: 50 }}>No budgets found for this fiscal year.</Text>
        )}
      </Page>
    </Document>
  );
}
