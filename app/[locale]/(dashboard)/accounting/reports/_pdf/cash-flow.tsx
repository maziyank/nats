import React from 'react';
import { Page, Text, View, Document } from '@react-pdf/renderer';
import { ReportContext } from '@/services/lib/reporting/types';
import { CashFlowReport, ReportAccountLine } from '../actions';
import { formatDate } from '@/services/lib/utils';
import { styles } from './styles';

const ActivityRow = ({ node, showComparative }: { node: ReportAccountLine, showComparative?: boolean }) => {
  return (
    <View style={styles.tableRow}>
      <View style={styles.colLabel}>
        <Text style={styles.label}>{node.name}</Text>
      </View>
      <View style={styles.colAmount}>
        <Text style={styles.amount}>{node.amount.toFixed(2)}</Text>
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
  );
};

export const CashFlowPdf = ({ data, company, config }: ReportContext<CashFlowReport & { startDate: string, endDate: string, comparativeStartDate?: string, comparativeEndDate?: string }>) => {
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
            <Text style={styles.title}>STATEMENT OF CASH FLOWS</Text>
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
            <Text style={[styles.labelBold, styles.colLabel]}>DESCRIPTION</Text>
            <Text style={[styles.labelBold, styles.colAmount]}>AMOUNT</Text>
            {showComparative && (
              <>
                <Text style={[styles.labelBold, styles.colAmount]}>PREVIOUS</Text>
                <Text style={[styles.labelBold, styles.colAmount]}>CHANGE</Text>
                <Text style={[styles.labelBold, styles.colPercent]}>%</Text>
              </>
            )}
          </View>

          <Text style={styles.sectionTitle}>OPERATING ACTIVITIES</Text>
          {data.operatingActivities.map((node, i) => (
            <ActivityRow key={i} node={node} showComparative={showComparative} />
          ))}
          <View style={styles.tableRowTotal}>
            <View style={styles.colLabel}>
              <Text style={styles.labelBold}>Net Cash from Operating</Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={styles.amountBold}>{data.netCashProvidedByOperating.toFixed(2)}</Text>
            </View>
            {showComparative && (
              <View style={styles.colAmount}>
                <Text style={styles.amount}>{data.previousNetCashProvidedByOperating?.toFixed(2) || "0.00"}</Text>
              </View>
            )}
          </View>

          <Text style={styles.sectionTitle}>INVESTING ACTIVITIES</Text>
          {data.investingActivities.length === 0 && (
            <View style={styles.tableRow}>
              <View style={styles.colLabel}>
                <Text style={[styles.label, { fontStyle: 'italic' }]}>No investing activities.</Text>
              </View>
            </View>
          )}
          {data.investingActivities.map((node, i) => (
            <ActivityRow key={i} node={node} showComparative={showComparative} />
          ))}
          <View style={styles.tableRowTotal}>
            <View style={styles.colLabel}>
              <Text style={styles.labelBold}>Net Cash from Investing</Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={styles.amountBold}>{data.netCashProvidedByInvesting.toFixed(2)}</Text>
            </View>
            {showComparative && (
              <View style={styles.colAmount}>
                <Text style={styles.amount}>{data.previousNetCashProvidedByInvesting?.toFixed(2) || "0.00"}</Text>
              </View>
            )}
          </View>

          <Text style={styles.sectionTitle}>FINANCING ACTIVITIES</Text>
          {data.financingActivities.length === 0 && (
            <View style={styles.tableRow}>
              <View style={styles.colLabel}>
                <Text style={[styles.label, { fontStyle: 'italic' }]}>No financing activities.</Text>
              </View>
            </View>
          )}
          {data.financingActivities.map((node, i) => (
            <ActivityRow key={i} node={node} showComparative={showComparative} />
          ))}
          <View style={styles.tableRowTotal}>
            <View style={styles.colLabel}>
              <Text style={styles.labelBold}>Net Cash from Financing</Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={styles.amountBold}>{data.netCashProvidedByFinancing.toFixed(2)}</Text>
            </View>
            {showComparative && (
              <View style={styles.colAmount}>
                <Text style={styles.amount}>{data.previousNetCashProvidedByFinancing?.toFixed(2) || "0.00"}</Text>
              </View>
            )}
          </View>

          <View style={[styles.tableRowTotal, { borderTopWidth: 2, marginTop: 10 }]}>
            <View style={styles.colLabel}>
              <Text style={[styles.labelBold, { fontSize: 12 }]}>NET INCREASE IN CASH</Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={[styles.amountBold, { fontSize: 12 }]}>{data.netIncreaseInCash.toFixed(2)}</Text>
            </View>
            {showComparative && (
              <View style={styles.colAmount}>
                <Text style={styles.amountBold}>{data.previousNetIncreaseInCash?.toFixed(2) || "0.00"}</Text>
              </View>
            )}
          </View>

          <View style={styles.tableRow}>
            <View style={styles.colLabel}>
              <Text style={styles.label}>Cash at Beginning of Period</Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={styles.amount}>{data.cashAtBeginning.toFixed(2)}</Text>
            </View>
            {showComparative && (
              <View style={styles.colAmount}>
                <Text style={styles.amount}>{data.previousCashAtBeginning?.toFixed(2) || "0.00"}</Text>
              </View>
            )}
          </View>

          <View style={styles.tableRow}>
            <View style={styles.colLabel}>
              <Text style={styles.labelBold}>Cash at End of Period</Text>
            </View>
            <View style={styles.colAmount}>
              <Text style={styles.amountBold}>{data.cashAtEnd.toFixed(2)}</Text>
            </View>
            {showComparative && (
              <View style={styles.colAmount}>
                <Text style={styles.amountBold}>{data.previousCashAtEnd?.toFixed(2) || "0.00"}</Text>
              </View>
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
