import React from 'react';
import { Page, Text, View, Document } from '@react-pdf/renderer';
import { ReportContext } from '@/services/lib/reporting/types';
import { formatDate } from '@/services/lib/utils';
import { styles } from './styles';
import { FinancialRatios } from '../actions';

const RatioRow = ({ label, value, isPercent = false, description }: { label: string, value: number, isPercent?: boolean, description?: string }) => {
  return (
    <View style={[styles.tableRow, { flexDirection: 'column' }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={styles.labelBold}>{label}</Text>
        <Text style={styles.amountBold}>{isPercent ? `${value.toFixed(1)}%` : value.toFixed(2)}</Text>
      </View>
      {description && <Text style={{ fontSize: 8, color: '#666' }}>{description}</Text>}
    </View>
  );
};

export const FinancialRatiosPdf = ({ data, company, config }: ReportContext<FinancialRatios & { date: string }>) => {
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
            <Text style={styles.title}>FINANCIAL RATIOS</Text>
            <Text style={styles.subtitle}>
              As of {formatDate(data.date, dateOptions)}
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <Text style={styles.sectionTitle}>LIQUIDITY</Text>
          <RatioRow
            label="Current Ratio"
            value={data.currentRatio}
            description="Ability to pay short-term obligations."
          />
          <RatioRow
            label="Quick Ratio"
            value={data.quickRatio}
            description="Ability to pay short-term obligations without selling inventory."
          />

          <Text style={styles.sectionTitle}>SOLVENCY</Text>
          <RatioRow
            label="Debt to Equity Ratio"
            value={data.debtToEquity}
            description="Proportion of equity and debt used to finance assets."
          />

          <Text style={styles.sectionTitle}>PROFITABILITY</Text>
          <RatioRow
            label="Gross Profit Margin"
            value={data.grossProfitMargin}
            isPercent
            description="Percentage of revenue that exceeds COGS."
          />
          <RatioRow
            label="Net Profit Margin"
            value={data.netProfitMargin}
            isPercent
            description="Percentage of revenue remaining after all expenses."
          />
          <RatioRow
            label="Return on Assets (ROA)"
            value={data.returnOnAssets}
            isPercent
            description="How profitable a company is relative to its total assets."
          />
          <RatioRow
            label="Return on Equity (ROE)"
            value={data.returnOnEquity}
            isPercent
            description="Profitability relative to shareholder's equity."
          />
        </View>

        <Text style={styles.footer}>
          {company.name} | Generated on {formatDate(new Date(), { dateFormat: company.dateFormat, includeTime: true })}
        </Text>
      </Page>
    </Document>
  );
};
