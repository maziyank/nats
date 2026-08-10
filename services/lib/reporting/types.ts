import { DocumentProps } from "@react-pdf/renderer";
import { ReactElement } from "react";
import { ZodSchema } from "zod";

export type ReportFormat = "PDF" | "HTML" | "EXCEL" | "CSV";

export interface ReportConfig {
  title?: string;
  showLogo?: boolean;
  pageSize?: "A4" | "LETTER" | "LEGAL";
  orientation?: "portrait" | "landscape";
  [key: string]: any;
}

export interface ReportContext<T = any> {
  data: T;
  config: ReportConfig;
  user: {
    name: string;
    email: string;
  };
  company: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    logoUrl?: string;
    // Formatting settings
    dateFormat?: string;
    currency?: string;
    currencySymbol?: string;
    currencyFormat?: string;
    locale?: string;
  };
  translations?: Record<string, string>;
}

export interface ReportDefinition<TInput = any, TData = any> {
  code: string;
  name: string;
  module: string; // e.g., "SALES", "PURCHASE"
  description?: string;

  // Validation schema for input parameters
  inputSchema?: ZodSchema<TInput>;

  // Function to fetch data based on input
  fetchData: (input: TInput) => Promise<TData>;

  // The React component to render the PDF
  // It receives ReportContext<TData> as props
  component: (props: ReportContext<TData>) => ReactElement;

  // Default configuration
  defaultConfig?: ReportConfig;
}
