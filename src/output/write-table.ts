export function writeTable(header: string[], rows: string[][]): void {
  if (!process.stdout.isTTY) {
    for (const row of rows) {
      process.stdout.write(`${row.join('\t')}\n`);
    }
    return;
  }

  const widths = getColumnWidths([header, ...rows]);
  process.stdout.write(`\x1b[2m${getTableLine(header, widths)}\x1b[0m\n`);
  for (const row of rows) {
    process.stdout.write(`${getTableLine(row, widths)}\n`);
  }
}

function getTableLine(row: string[], widths: number[]): string {
  const cells = row.map((cell, index) => (index === row.length - 1 ? cell : cell.padEnd(widths[index] ?? 0)));
  return cells.join('  ').trimEnd();
}

function getColumnWidths(rows: string[][]): number[] {
  const widths: number[] = [];
  for (const row of rows) {
    for (const [index, cell] of row.entries()) {
      widths[index] = Math.max(widths[index] ?? 0, cell.length);
    }
  }
  return widths;
}
