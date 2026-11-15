// Minimal RFC 4180 CSV: quoted fields with commas, quotes ("") and newlines.

/** The delimiter of a CSV file, guessed from its header line: , ; or tab. */
function guessDelimiter(text) {
  const header = text.slice(0, text.search(/\r?\n|$/));
  const counts = [',', ';', '\t'].map((d) => [d, header.split(d).length]);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

/** Parse CSV text into rows (arrays of strings). Handles a UTF-8 BOM. */
export function parseCsv(input, delimiter = guessDelimiter(input)) {
  const text = input.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/** Rows as objects keyed by the (trimmed) header names. */
export function parseCsvObjects(text) {
  const [header = [], ...rows] = parseCsv(text);
  const keys = header.map((h) => h.trim());
  return { headers: keys, rows: rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? '']))) };
}

const quote = (value) => {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** CSV text (CRLF line ends, as spreadsheets expect) from rows of values. */
export const toCsv = (rows) => rows.map((r) => r.map(quote).join(',')).join('\r\n') + '\r\n';
