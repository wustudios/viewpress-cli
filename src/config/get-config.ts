import type { Config } from './config.ts';
import { getRuntimeOptions } from '../cli/runtime-options.ts';
import { findStoredConfig } from './find-stored-config.ts';
import { getApiUrl } from './get-api-url.ts';
import { guardApiKey } from './guard-api-key.ts';

const defaultApiUrl = 'https://viewpress.ai/api/v1';

export async function getConfig(): Promise<Config> {
  const storedConfig = await findStoredConfig();
  const apiUrl = getApiUrl(
    getRuntimeOptions().apiUrl ?? process.env.VIEWPRESS_API_URL ?? storedConfig?.api_url ?? defaultApiUrl,
  );
  const environmentApiKey = process.env.VIEWPRESS_API_KEY?.trim();

  if (environmentApiKey) {
    guardApiKey(environmentApiKey);
    return { apiKey: environmentApiKey, apiKeySource: 'environment', apiUrl };
  }

  if (storedConfig?.api_key) {
    return { apiKey: storedConfig.api_key, apiKeySource: 'file', apiUrl };
  }

  return { apiKey: null, apiKeySource: null, apiUrl };
}
