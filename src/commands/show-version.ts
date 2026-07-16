import { getRuntimeOptions } from '../cli/runtime-options.ts';
import { writeJson } from '../output/write-json.ts';

export function showVersion(version: string): void {
  if (getRuntimeOptions().json) {
    writeJson({ version });
    return;
  }

  process.stdout.write(`${version}\n`);
}
