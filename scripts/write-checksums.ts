import { createReadStream } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';

const distributionDirectory = 'dist';
const entries = await readdir(distributionDirectory, { withFileTypes: true });
const binaryNames = entries
  .filter((entry) => entry.isFile() && entry.name.startsWith('viewpress-'))
  .map((entry) => entry.name)
  .sort();

if (binaryNames.length === 0) {
  throw new Error('No release binaries found in dist.');
}

const lines: string[] = [];
for (const binaryName of binaryNames) {
  const path = join(distributionDirectory, binaryName);
  lines.push(`${await getSha256(path)}  ${basename(path)}`);
}

await writeFile(join(distributionDirectory, 'SHA256SUMS'), `${lines.join('\n')}\n`);
process.stdout.write(`Wrote checksums for ${String(binaryNames.length)} binaries.\n`);

function getSha256(path: string): Promise<string> {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => {
      hash.update(chunk);
    });
    stream.on('error', rejectHash);
    stream.on('end', () => {
      resolveHash(hash.digest('hex'));
    });
  });
}
