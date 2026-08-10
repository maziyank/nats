import React from 'react';
import { Page, Text, View, Document } from '@react-pdf/renderer';
import { ReportContext } from '@/services/lib/reporting/types';
import { EquityChangeReport } from '../actions';
import { formatDate } from '@/services/lib/utils';
import { styles } from './styles';

export const EquityChangePdf = ({ data, company, config }: ReportContext<EquityChangeReport & { startDate: string, endDate: string, comparativeStartDate?: string, comparativeEndDate?: string }>) => {
  const showComparative = !!data.comparativeStartDate;
  const dateOptions = {
    dateFormat: company.dateFormat,
  };

  return (
    <Document>
      <Page size={config.pageSize || "A4"} orientation={config.orientation || "landscape"} style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.companyName}>{company.name}</Text>
            <Text style={styles.companyInfo}>{company.address}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.title}>STATEMENT OF CHANGES IN EQUITY</Text>
            <Text style={styles.subtitle}>
              {formatDate(data.startDate, dateOptions)} - {formatDate(data.endDate, dateOptions)}
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.labelBold, styles.colLabel]}>ACCOUNT</Text>
            <Text style={[styles.labelBold, styles.colAmount]}>BEGINNING</Text>
            <Text style={[styles.labelBold, styles.colAmount]}>NET INCOME</Text>
            <Text style={[styles.labelBold, styles.colAmount]}>ADDITIONS</Text>
            <Text style={[styles.labelBold, styles.colAmount]}>DEDUCTIONS</Text>
            <Text style={[styles.labelBold, styles.colAmount]}>ENDING</Text>
          </View>

          {data.items.map((item, i) => (
            <View key={i} style={styles.tableRow}>
              <View style={styles.colLabel}>
                <Text style={styles.label}>{item.name}</Text>
              </View>
              <View style={styles.colAmount}>
                <Text style={styles.amount}>{item.balanceBeginning.toFixed(2)}</Text>
              </View>
              <View style={styles.colAmount}>
                <Text style={styles.amount}>{item.netIncome.toFixed(2)}</Text>
              </View>
              <View style={styles.colAmount}>
                <Text style={styles.amount}>{item.additions.toFixed(2)}</Text>
              </View>
              <View style={styles.colAmount}>
                <Text style={styles.amount}>{item.deductions.toFixed(2)}</Text>
              </View>
              <View style={styles.colAmount}>
                <Text style={styles.amountBold}>{item.balanceEnding.toFixed(2)}</Text>
              </View>
            </View>
          ))}

          <View style={styles.tableRowTotal}>
            <View style={styles.colLabel}>
              <Text style={styles.labelBold}>TOTAL</Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={styles.amountBold}>{data.totalBeginning.toFixed(2)}</Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={styles.amountBold}>{data.totalNetIncome.toFixed(2)}</Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={styles.amountBold}>{data.totalAdditions.toFixed(2)}</Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={styles.amountBold}>{data.totalDeductions.toFixed(2)}</Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={styles.amountBold}>{data.totalEnding.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          {company.name} | Generated on {formatDate(new Date(), { ...dateOptions, includeTime: true })}
        </Text>
      </Page>
    </Document>
  );
};
