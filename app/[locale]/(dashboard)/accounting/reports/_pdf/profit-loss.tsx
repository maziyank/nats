import React from 'react';
import { Page, Text, View, Document } from '@react-pdf/renderer';
import { ReportContext } from '@/services/lib/reporting/types';
import { ProfitLossReport, ReportAccountLine } from '../actions';
import { formatDate } from '@/services/lib/utils';
import { styles } from './styles';

// Recursive component to render account tree
const AccountRow = ({ node, level = 0, showComparative }: { node: ReportAccountLine, level?: number, showComparative?: boolean }) => {
  const indentStyle = level === 1 ? styles.indent1 : level === 2 ? styles.indent2 : level >= 3 ? styles.indent3 : {};
  const isBold = node.children && node.children.length > 0;

  return (
    <>
      <View style={styles.tableRow}>
        <View style={[styles.colLabel, indentStyle]}>
          <Text style={isBold ? styles.labelBold : styles.label}>{node.name}</Text>
        </View>
        <View style={styles.colAmount}>
          <Text style={isBold ? styles.amountBold : styles.amount}>{node.amount.toFixed(2)}</Text>
        </View>
        {showComparative && (
          <>
            <View style={styles.colAmount}>
              <Text style={styles.amount}>{node.previousAmount?.toFixed(2) || "0.00"}</Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={styles.amount}>{node.change?.toFixed(2) || "0.00"}</Text>
            </View>
            <View style={styles.colPercent}>
              <Text style={styles.amount}>{node.changePercentage?.toFixed(1) || "0.0"}%</Text>
            </View>
          </>
        )}
      </View>
      {node.children && node.children.map((child) => (
        <AccountRow key={child.accountId} node={child} level={level + 1} showComparative={showComparative} />
      ))}
    </>
  );
};

export const ProfitLossPdf = ({ data, company, config }: ReportContext<ProfitLossReport & { startDate: string, endDate: string, comparativeStartDate?: string, comparativeEndDate?: string }>) => {
  const showComparative = !!data.comparativeStartDate;
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
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.title}>PROFIT AND LOSS</Text>
            <Text style={styles.subtitle}>
              {formatDate(data.startDate, dateOptions)} - {formatDate(data.endDate, dateOptions)}
            </Text>
            {showComparative && (
              <Text style={[styles.subtitle, { fontSize: 8 }]}>
                Compared to: {formatDate(data.comparativeStartDate!, dateOptions)} - {formatDate(data.comparativeEndDate!, dateOptions)}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.labelBold, styles.colLabel]}>ACCOUNT</Text>
            <Text style={[styles.labelBold, styles.colAmount]}>AMOUNT</Text>
            {showComparative && (
              <>
                <Text style={[styles.labelBold, styles.colAmount]}>PREVIOUS</Text>
                <Text style={[styles.labelBold, styles.colAmount]}>CHANGE</Text>
                <Text style={[styles.labelBold, styles.colPercent]}>%</Text>
              </>
            )}
          </View>

          <Text style={styles.sectionTitle}>REVENUE</Text>
          {data.revenue.map((node) => (
            <AccountRow key={node.accountId} node={node} showComparative={showComparative} />
          ))}
          <View style={styles.tableRowTotal}>
            <View style={styles.colLabel}>
              <Text style={styles.labelBold}>TOTAL REVENUE</Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={styles.amountBold}>{data.totalRevenue.toFixed(2)}</Text>
            </View>
            {showComparative && (
              <>
                <View style={styles.colAmount}>
                  <Text style={styles.amount}>{data.previousTotalRevenue?.toFixed(2) || "0.00"}</Text>
                </View>
                <View style={styles.colAmount} />
                <View style={styles.colPercent} />
              </>
            )}
          </View>

          <Text style={styles.sectionTitle}>EXPENSES</Text>
          {data.expenses.map((node) => (
            <AccountRow key={node.accountId} node={node} showComparative={showComparative} />
          ))}
          <View style={styles.tableRowTotal}>
            <View style={styles.colLabel}>
              <Text style={styles.labelBold}>TOTAL EXPENSES</Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={styles.amountBold}>{data.totalExpenses.toFixed(2)}</Text>
            </View>
            {showComparative && (
              <>
                <View style={styles.colAmount}>
                  <Text style={styles.amount}>{data.previousTotalExpenses?.toFixed(2) || "0.00"}</Text>
                </View>
                <View style={styles.colAmount} />
                <View style={styles.colPercent} />
              </>
            )}
          </View>

          <View style={[styles.tableRowTotal, { borderTopWidth: 2, marginTop: 10 }]}>
            <View style={styles.colLabel}>
              <Text style={[styles.labelBold, { fontSize: 12 }]}>NET INCOME</Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={[styles.amountBold, { fontSize: 12 }]}>{data.netIncome.toFixed(2)}</Text>
            </View>
            {showComparative && (
              <>
                <View style={styles.colAmount}>
                  <Text style={styles.amountBold}>{data.previousNetIncome?.toFixed(2) || "0.00"}</Text>
                </View>
                <View style={styles.colAmount} />
                <View style={styles.colPercent} />
              </>
            )}
          </View>
        </View>

        <Text style={styles.footer}>
          {company.name} | Generated on {formatDate(new Date(), { dateFormat: company.dateFormat, includeTime: true })}
        </Text>
      </Page>
    </Document>
  );
};
