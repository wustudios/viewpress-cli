import { randomUUID } from 'node:crypto';
import { chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { platform } from 'node:process';

import type { StoredConfig } from './stored-config.ts';
import { getConfigDirectory } from './get-config-directory.ts';
import { getConfigPath } from './get-config-path.ts';

export async function writeStoredConfig(config: StoredConfig): Promise<void> {
  const configDirectory = getConfigDirectory();
  const configPath = getConfigPath();
  const temporaryPath = `${configPath}.${String(process.pid)}.${randomUUID()}.tmp`;

  await mkdir(configDirectory, { mode: 0o700, recursive: true });
  await setMode(configDirectory, 0o700);

  try {
    await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    await setMode(temporaryPath, 0o600);
    await rename(temporaryPath, configPath);
    await setMode(configPath, 0o600);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function setMode(path: string, mode: number): Promise<void> {
  if (platform !== 'win32') {
    await chmod(path, mode);
  }
}
