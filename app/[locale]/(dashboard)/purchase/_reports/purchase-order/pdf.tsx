import React from 'react';
import { Page, Text, View, Document, StyleSheet } from '@react-pdf/renderer';
import { ReportContext } from '@/services/lib/reporting/types';
import { PurchaseOrderReportData } from './data';
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
  colDesc: { width: '40%' },
  colQty: { width: '15%', textAlign: 'right' },
  colPrice: { width: '20%', textAlign: 'right' },
  colTotal: { width: '25%', textAlign: 'right' },
  totalSection: { flexDirection: 'column', alignItems: 'flex-end', marginTop: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 5, width: '50%' },
  totalLabel: { width: '50%', textAlign: 'right', paddingRight: 10, color: '#666' },
  totalValue: { width: '50%', textAlign: 'right', fontWeight: 'bold' },
  footer: { position: 'absolute', bottom: 30, left: 30, right: 30, textAlign: 'center', color: '#888', fontSize: 8, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10 },
});

export const PurchaseOrderPdf = ({ data, company, config }: ReportContext<PurchaseOrderReportData>) => {
  const { order } = data;
  const currencyOptions = {
    currency: company.currency,
    currencySymbol: company.currencySymbol,
    currencyFormat: company.currencyFormat,
    locale: company.locale,
  };
  const dateOptions = {
    dateFormat: company.dateFormat,
  };

  return (
    <Document>
      <Page size={config.pageSize || "A4"} orientation={config.orientation || "portrait"} style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.companyName}>{company.name}</Text>
            <Text style={styles.companyInfo}>{company.address}</Text>
            <Text style={styles.companyInfo}>{company.email}</Text>
            <Text style={styles.companyInfo}>{company.phone}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.title}>PURCHASE ORDER</Text>
            <Text style={styles.subtitle}>#{order.orderNumber}</Text>
            <Text style={styles.value}>{formatDate(order.orderDate, dateOptions)}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.column}>
            <Text style={styles.label}>VENDOR</Text>
            <Text style={[styles.value, { fontWeight: 'bold' }]}>{order.contact.name}</Text>
            <Text style={styles.value}>{order.contact.email}</Text>
            <Text style={styles.value}>{order.contact.phone}</Text>
            <Text style={styles.value}>{order.contact.billingAddress}</Text>
          </View>
          <View style={styles.column}>
            <Text style={styles.label}>SHIP TO</Text>
            <Text style={[styles.value, { fontWeight: 'bold' }]}>{company.name}</Text>
            <Text style={styles.value}>{company.address}</Text>
          </View>
          <View style={styles.column}>
            <Text style={styles.label}>DETAILS</Text>
            <Text style={styles.label}>Status</Text>
            <Text style={styles.value}>{order.status}</Text>
            <Text style={styles.label}>Expected Date</Text>
            <Text style={styles.value}>{order.expectedDate ? formatDate(order.expectedDate, dateOptions) : 'N/A'}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.label, styles.colDesc]}>ITEM DESCRIPTION</Text>
            <Text style={[styles.label, styles.colQty]}>QTY</Text>
            <Text style={[styles.label, styles.colPrice]}>UNIT COST</Text>
            <Text style={[styles.label, styles.colTotal]}>AMOUNT</Text>
          </View>
          {order.items.map((item: any) => (
            <View key={item.id} style={styles.tableRow}>
              <Text style={[styles.value, styles.colDesc]}>{item.product?.name || item.description}</Text>
              <Text style={[styles.value, styles.colQty]}>{item.quantity}</Text>
              <Text style={[styles.value, styles.colPrice]}>{formatCurrency(item.unitCost, currencyOptions)}</Text>
              <Text style={[styles.value, styles.colTotal]}>{formatCurrency(item.totalCost, currencyOptions)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalSection}>
          <View style={[styles.totalRow, { borderTopWidth: 1, borderTopColor: '#000', paddingTop: 5 }]}>
            <Text style={[styles.totalLabel, { color: '#000', fontWeight: 'bold' }]}>TOTAL:</Text>
            <Text style={[styles.totalValue, { fontSize: 12 }]}>{formatCurrency(order.totalAmount, currencyOptions)}</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          {company.name} | {company.website || 'www.company.com'} | Generated on {formatDate(new Date(), { ...dateOptions, includeTime: true })}
        </Text>
      </Page>
    </Document>
  );
};
