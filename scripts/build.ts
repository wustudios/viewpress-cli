import { mkdir, rm } from 'node:fs/promises';
import { arch, platform } from 'node:process';

const builds = [
  { name: 'viewpress-darwin-arm64', target: 'bun-darwin-arm64' },
  { name: 'viewpress-darwin-x64', target: 'bun-darwin-x64' },
  { name: 'viewpress-linux-arm64', target: 'bun-linux-arm64' },
  { name: 'viewpress-linux-x64', target: 'bun-linux-x64' },
  { name: 'viewpress-windows-x64.exe', target: 'bun-windows-x64' },
] as const;

await rm('dist', { force: true, recursive: true });
await mkdir('dist', { recursive: true });

const selectedBuilds = Bun.argv.includes('--native') ? [getNativeBuild()] : builds;

for (const build of selectedBuilds) {
  await buildBinary(build);
}

function getNativeBuild(): (typeof builds)[number] {
  const platformName = platform === 'win32' ? 'windows' : platform;
  const target = `bun-${platformName}-${arch}`;
  const build = builds.find((candidate) => candidate.target === target);

  if (!build) {
    throw new Error(`Unsupported build host: ${platform}-${arch}`);
  }

  return build;
}

async function buildBinary(build: (typeof builds)[number]): Promise<void> {
  const childProcess = Bun.spawn(
    [
      'bun',
      'build',
      'src/cli.ts',
      '--compile',
      `--target=${build.target}`,
      `--outfile=dist/${build.name}`,
    ],
    { stderr: 'inherit', stdout: 'inherit' },
  );
  const exitCode = await childProcess.exited;

  if (exitCode !== 0) {
    throw new Error(`Build failed for ${build.target}`);
  }
}
