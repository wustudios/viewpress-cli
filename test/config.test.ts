import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platform } from 'node:process';

import { getConfig } from '../src/config/get-config.ts';
import { removeStoredApiKey } from '../src/config/remove-stored-api-key.ts';
import { setStoredApiKey } from '../src/config/set-stored-api-key.ts';

const originalConfigDirectory = process.env.VIEWPRESS_CONFIG_DIR;
const originalApiUrl = process.env.VIEWPRESS_API_URL;
const originalApiKey = process.env.VIEWPRESS_API_KEY;
const temporaryDirectories: string[] = [];

afterEach(async () => {
  setEnvironment('VIEWPRESS_CONFIG_DIR', originalConfigDirectory);
  setEnvironment('VIEWPRESS_API_URL', originalApiUrl);
  setEnvironment('VIEWPRESS_API_KEY', originalApiKey);

  await Promise.all(
    temporaryDirectories.splice(0).map(async (path) => {
      await rm(path, { force: true, recursive: true });
    }),
  );
});

describe('config', () => {
  test('stores a key in a private config file and removes it', async () => {
    const configDirectory = await getTemporaryConfigDirectory();
    process.env.VIEWPRESS_CONFIG_DIR = configDirectory;
    delete process.env.VIEWPRESS_API_URL;
    delete process.env.VIEWPRESS_API_KEY;

    await setStoredApiKey('vp_test_key', 'https://viewpress.ai/api/v1');

    expect(await getConfig()).toEqual({
      apiKey: 'vp_test_key',
      apiKeySource: 'file',
      apiUrl: 'https://viewpress.ai/api/v1',
    });
    await expectPrivateModes(configDirectory);

    await removeStoredApiKey();
    expect((await getConfig()).apiKey).toBeNull();
    expect(await readFile(join(configDirectory, 'config.json'), 'utf8')).not.toContain('vp_test_key');
  });

  test('uses environment values before stored values', async () => {
    process.env.VIEWPRESS_CONFIG_DIR = await getTemporaryConfigDirectory();
    await setStoredApiKey('vp_stored', 'https://viewpress.ai/api/v1');
    process.env.VIEWPRESS_API_URL = 'https://example.com/custom/';
    process.env.VIEWPRESS_API_KEY = 'vp_environment';

    expect(await getConfig()).toEqual({
      apiKey: 'vp_environment',
      apiKeySource: 'environment',
      apiUrl: 'https://example.com/custom',
    });
  });
});

async function getTemporaryConfigDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'viewpress-cli-config-'));
  temporaryDirectories.push(path);
  return path;
}

async function expectPrivateModes(configDirectory: string): Promise<void> {
  if (platform === 'win32') {
    return;
  }

  const directoryStats = await stat(configDirectory);
  const fileStats = await stat(join(configDirectory, 'config.json'));
  expect(directoryStats.mode & 0o777).toBe(0o700);
  expect(fileStats.mode & 0o777).toBe(0o600);
}

function setEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, name);
    return;
  }

  process.env[name] = value;
}
