import ExcelJS from "exceljs";
import type { ExportColumn } from "./types";
import { resolveCellValue } from "./utils";

/**
 * Build an Excel (.xlsx) buffer from rows and column definitions.
 */
export async function buildExcelBuffer<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  sheetName = "Report",
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NATS";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName.slice(0, 31) || "Report");

  sheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: Math.min(Math.max(col.header.length + 4, 12), 40),
  }));

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF3F4F6" },
  };
  headerRow.alignment = { vertical: "middle" };

  for (const row of rows) {
    const values = columns.map((col) => {
      const v = resolveCellValue(row, col);
      return v === null ? "" : v;
    });
    sheet.addRow(values);
  }

  // Freeze header
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
