// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * A small, dependency-free RFC-4180 CSV parser. Platform exports (Shopify,
 * WooCommerce) embed commas and newlines inside quoted HTML descriptions and
 * escape quotes as `""`, so a naive split is wrong — this is a proper
 * state-machine parser that handles quotes, escaped quotes, CRLF, and a BOM.
 */

/** Parse CSV text into a matrix of raw string cells (header row included). */
export function parseCsv(input: string): string[][] {
  // Strip a UTF-8 BOM if present (common in Excel-exported CSVs).
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const endField = (): void => {
    row.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      endField();
      i += 1;
      continue;
    }
    if (c === '\r') {
      // Swallow CR; the following LF (or EOF) terminates the row.
      i += 1;
      continue;
    }
    if (c === '\n') {
      endRow();
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }

  // Flush the trailing field/row unless the input ended on a clean newline.
  if (field.length > 0 || row.length > 0) endRow();

  return rows;
}

export interface CsvTable {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Parse CSV into header-keyed row objects, trimming cells and dropping blank
 * lines. Duplicate headers keep the first occurrence's column.
 */
export function parseCsvTable(input: string): CsvTable {
  const matrix = parseCsv(input);
  if (matrix.length === 0) return { headers: [], rows: [] };

  const headers = matrix[0].map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r];
    if (cells.every((c) => c.trim() === '')) continue; // blank line
    const obj: Record<string, string> = {};
    for (let h = 0; h < headers.length; h++) {
      const key = headers[h];
      if (key in obj) continue; // first duplicate header wins
      obj[key] = (cells[h] ?? '').trim();
    }
    rows.push(obj);
  }

  return { headers, rows };
}
