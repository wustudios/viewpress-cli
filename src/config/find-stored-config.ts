import { readFile } from 'node:fs/promises';

import { CliError } from '../cli/cli-error.ts';
import type { StoredConfig } from './stored-config.ts';
import { getConfigPath } from './get-config-path.ts';
import { getApiUrl } from './get-api-url.ts';
import { guardApiKey } from './guard-api-key.ts';

export async function findStoredConfig(): Promise<StoredConfig | null> {
  let contents: string;

  try {
    contents = await readFile(getConfigPath(), 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }

  return parseStoredConfig(contents);
}

function parseStoredConfig(contents: string): StoredConfig {
  let value: unknown;

  try {
    value = JSON.parse(contents);
  } catch {
    throwInvalidConfig();
  }

  if (!isRecord(value) || typeof value.api_url !== 'string') {
    throwInvalidConfig();
  }

  const apiUrl = getApiUrl(value.api_url);

  if (value.api_key === undefined) {
    return { api_url: apiUrl };
  }

  if (typeof value.api_key !== 'string') {
    throwInvalidConfig();
  }

  guardApiKey(value.api_key);
  return { api_key: value.api_key, api_url: apiUrl };
}

function throwInvalidConfig(): never {
  throw new CliError({
    exitCode: 2,
    message: 'The Viewpress config file is invalid.',
    type: 'config_error',
  });
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
