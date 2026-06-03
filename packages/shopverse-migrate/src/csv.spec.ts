// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import { parseCsv, parseCsvTable } from './csv';

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps commas inside quoted fields', () => {
    expect(parseCsv('a,"b,c",d')).toEqual([['a', 'b,c', 'd']]);
  });

  it('keeps newlines inside quoted fields', () => {
    expect(parseCsv('a,"line1\nline2",c')).toEqual([['a', 'line1\nline2', 'c']]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('a,"say ""hi""",c')).toEqual([['a', 'say "hi"', 'c']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips a UTF-8 BOM', () => {
    expect(parseCsv('﻿a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('does not emit a trailing empty row for a clean final newline', () => {
    expect(parseCsv('a,b\n1,2\n')).toHaveLength(2);
  });
});

describe('parseCsvTable', () => {
  it('keys cells by trimmed header and drops blank lines', () => {
    const { headers, rows } = parseCsvTable('Name , Price\nTee, 19.99\n\nMug,9.99\n');
    expect(headers).toEqual(['Name', 'Price']);
    expect(rows).toEqual([
      { Name: 'Tee', Price: '19.99' },
      { Name: 'Mug', Price: '9.99' },
    ]);
  });

  it('returns empty for empty input', () => {
    expect(parseCsvTable('')).toEqual({ headers: [], rows: [] });
  });
});
