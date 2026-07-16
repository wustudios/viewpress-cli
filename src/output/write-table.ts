export function writeTable(rows: string[][]): void {
  if (!process.stdout.isTTY) {
    for (const row of rows) {
      process.stdout.write(`${row.join('\t')}\n`);
    }
    return;
  }

  const widths = getColumnWidths(rows);
  for (const row of rows) {
    const cells = row.map((cell, index) => (index === row.length - 1 ? cell : cell.padEnd(widths[index] ?? 0)));
    process.stdout.write(`${cells.join('  ').trimEnd()}\n`);
  }
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
