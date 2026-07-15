import { arch, platform } from 'node:process';

const extension = platform === 'win32' ? '.exe' : '';
const binaryPath = `dist/viewpress-${platform}-${arch}${extension}`;
const version = runBinary(['--version']).trim();

if (version !== '0.1.0') {
  throw new Error(`Unexpected version: ${version}`);
}

const help = runBinary(['--help']);

if (!help.includes('Usage: viewpress')) {
  throw new Error('Help output does not contain usage text');
}

function runBinary(arguments_: string[]): string {
  const result = Bun.spawnSync([binaryPath, ...arguments_]);

  if (result.exitCode !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  }

  return result.stdout.toString();
}
