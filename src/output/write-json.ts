export function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify({ ok: true, data: value })}\n`);
}
