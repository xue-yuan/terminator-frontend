import { describe, expect, it } from 'vite-plus/test';
import { parseCsv, parseCsvObjects, toCsv } from './csv';

describe('csv', () => {
  it('parses quotes, embedded delimiters, quotes and newlines, CRLF and a BOM', () => {
    const text = '﻿a,b,c\r\n"x, y","say ""hi""","two\nlines"\r\n1,,3\r\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'two\nlines'],
      ['1', '', '3'],
    ]);
  });

  it('guesses ; and tab delimiters from the header', () => {
    expect(parseCsv('a;b\n1,5;2\n')).toEqual([
      ['a', 'b'],
      ['1,5', '2'],
    ]);
    expect(parseCsvObjects('a\tb\n1\t2').rows).toEqual([{ a: '1', b: '2' }]);
  });

  it('writes what it reads', () => {
    const rows = [
      ['name', 'notes'],
      ['Bench, flat', 'he said "go"\nnext line'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
