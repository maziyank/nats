"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { clientRegistry } from "@/services/lib/reporting/client-registry";
import { getReportData } from "../actions";
import { SuperJSON } from "@/services/lib/superjson";
import { Loader2 } from "lucide-react";
import { ReportContext } from "@/services/lib/reporting/types";

// Dynamically import PDFViewer to avoid SSR issues
const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((mod) => mod.PDFViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-muted/20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    ),
  }
);

import { cn } from "@/services/lib/utils";

interface ReportPreviewProps {
  code: string;
  input: any;
  className?: string;
}

export function ReportPreview({ code, input, className }: ReportPreviewProps) {
  const [data, setData] = useState<ReportContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getReportData(code, input);
        if (res.success && res.data) {
          setData(SuperJSON.deserialize(res.data));
        } else {
          setError(res.error || "Failed to load report data");
        }
      } catch (err: any) {
        setError(err.message || "An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [code, JSON.stringify(input)]);

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Generating Report...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[80vh] items-center justify-center text-destructive">
        <p>Error: {error}</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const ReportComponent = clientRegistry[code as keyof typeof clientRegistry];

  if (!ReportComponent) {
    return (
      <div className="flex h-[80vh] items-center justify-center text-destructive">
        <p>Report template not found for code: {code}</p>
      </div>
    );
  }

  return (
    <div className={cn("h-[calc(100vh-100px)] w-full overflow-hidden rounded-md border shadow-sm", className)}>
      <PDFViewer width="100%" height="100%" className="border-none">
        <ReportComponent {...data} />
      </PDFViewer>
    </div>
  );
}
