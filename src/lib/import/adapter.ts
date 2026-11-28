/** A sheet as read from a file: header row, data rows and the real Excel row number of each data row. */
export type SheetData = { headers: string[]; rows: unknown[][]; rowNos?: number[] };

export type AdapterOutput = {
  /** The same data re-shaped to the standard template columns. */
  sheet: SheetData;
  /** Plain-language remarks shown after "Check file" (what was derived, moved or skipped). */
  notes: string[];
  /** Columns of the uploaded file that were used / not used. */
  matched: string[];
  ignored: string[];
};

/**
 * Lets an import accept an existing spreadsheet layout (for example an old asset register)
 * in addition to the standard template.
 */
export type ImportAdapter = {
  detect: (headers: string[]) => boolean;
  convert: (sheet: SheetData) => AdapterOutput | { error: string };
};
