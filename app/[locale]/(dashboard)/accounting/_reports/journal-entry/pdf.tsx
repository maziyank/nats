import React from 'react';
import { Page, Text, View, Document, StyleSheet } from '@react-pdf/renderer';
import { ReportContext } from '@/services/lib/reporting/types';
import { JournalEntryReportData } from './data';
import { formatCurrency, formatDate } from '@/services/lib/utils';

const styles = StyleSheet.create({
  page: { flexDirection: 'column', backgroundColor: '#FFFFFF', padding: 30, fontSize: 10, fontFamily: 'Helvetica' },
  header: { marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#112233', paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'column' },
  headerRight: { flexDirection: 'column', alignItems: 'flex-end' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#112233', marginBottom: 5 },
  subtitle: { fontSize: 12, color: '#666' },
  companyName: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  companyInfo: { fontSize: 10, color: '#444', marginBottom: 2 },
  row: { flexDirection: 'row', marginBottom: 20 },
  column: { flexDirection: 'column', flexGrow: 1 },
  label: { fontSize: 8, color: '#888', marginBottom: 2, textTransform: 'uppercase' },
  value: { fontSize: 10, color: '#000', marginBottom: 8 },
  table: { width: '100%', borderWidth: 1, borderColor: '#eee', marginBottom: 20 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f8f9fa', borderBottomWidth: 1, borderBottomColor: '#eee', padding: 8 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eee', padding: 8 },
  colAccount: { width: '40%' },
  colDesc: { width: '30%' },
  colDebit: { width: '15%', textAlign: 'right' },
  colCredit: { width: '15%', textAlign: 'right' },
  totalSection: { flexDirection: 'column', alignItems: 'flex-end', marginTop: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 5, width: '50%' },
  totalLabel: { width: '50%', textAlign: 'right', paddingRight: 10, color: '#666' },
  totalValue: { width: '50%', textAlign: 'right', fontWeight: 'bold' },
  footer: { position: 'absolute', bottom: 30, left: 30, right: 30, textAlign: 'center', color: '#888', fontSize: 8, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10 },
});

export const JournalEntryPdf = ({ data, company, config }: ReportContext<JournalEntryReportData>) => {
  const { entry } = data;
  const currencyOptions = {
    currency: company.currency,
    currencySymbol: company.currencySymbol,
    currencyFormat: company.currencyFormat,
    locale: company.locale,
  };
  const dateOptions = {
    dateFormat: company.dateFormat,
  };
  const totalDebit = entry.lines.reduce((sum: number, line: any) => sum + Number(line.debitAmount), 0);
  const totalCredit = entry.lines.reduce((sum: number, line: any) => sum + Number(line.creditAmount), 0);

  return (
    <Document>
      <Page size={config.pageSize || "A4"} orientation={config.orientation || "portrait"} style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.companyName}>{company.name}</Text>
            <Text style={styles.companyInfo}>{company.address}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.title}>JOURNAL ENTRY</Text>
            <Text style={styles.subtitle}>#{entry.entryNumber}</Text>
            <Text style={styles.value}>{formatDate(entry.transactionDate, dateOptions)}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.column}>
            <Text style={styles.label}>DESCRIPTION</Text>
            <Text style={styles.value}>{entry.description || "N/A"}</Text>
          </View>
          <View style={styles.column}>
            <Text style={styles.label}>STATUS</Text>
            <Text style={styles.value}>{entry.status}</Text>
            <Text style={styles.label}>POSTED BY</Text>
            <Text style={styles.value}>{entry.user?.name || "System"}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.label, styles.colAccount]}>ACCOUNT</Text>
            <Text style={[styles.label, styles.colDesc]}>DESCRIPTION</Text>
            <Text style={[styles.label, styles.colDebit]}>DEBIT</Text>
            <Text style={[styles.label, styles.colCredit]}>CREDIT</Text>
          </View>
          {entry.lines.map((line: any) => (
            <View key={line.id} style={styles.tableRow}>
              <View style={styles.colAccount}>
                <Text style={[styles.value, { fontWeight: 'bold' }]}>{line.account.code} - {line.account.name}</Text>
                {line.contact && <Text style={{ fontSize: 8, color: '#666' }}>{line.contact.name}</Text>}
              </View>
              <Text style={[styles.value, styles.colDesc]}>{line.description}</Text>
              <Text style={[styles.value, styles.colDebit]}>{Number(line.debitAmount) > 0 ? formatCurrency(line.debitAmount, currencyOptions) : "-"}</Text>
              <Text style={[styles.value, styles.colCredit]}>{Number(line.creditAmount) > 0 ? formatCurrency(line.creditAmount, currencyOptions) : "-"}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalSection}>
          <View style={[styles.totalRow, { borderTopWidth: 1, borderTopColor: '#000', paddingTop: 5 }]}>
            <Text style={[styles.totalLabel, { color: '#000', fontWeight: 'bold' }]}>TOTAL:</Text>
            <Text style={[styles.totalValue, { fontSize: 10, width: '25%' }]}>{formatCurrency(totalDebit, currencyOptions)}</Text>
            <Text style={[styles.totalValue, { fontSize: 10, width: '25%' }]}>{formatCurrency(totalCredit, currencyOptions)}</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          {company.name} | {company.website || 'www.company.com'} | Generated on {formatDate(new Date(), { ...dateOptions, includeTime: true })}
        </Text>
      </Page>
    </Document>
  );
};
