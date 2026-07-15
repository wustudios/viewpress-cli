import { getApiUrl } from './get-api-url.ts';
import { guardApiKey } from './guard-api-key.ts';
import { writeStoredConfig } from './write-stored-config.ts';

export async function setStoredApiKey(apiKey: string, apiUrl: string): Promise<void> {
  const trimmedApiKey = apiKey.trim();
  guardApiKey(trimmedApiKey);
  await writeStoredConfig({ api_key: trimmedApiKey, api_url: getApiUrl(apiUrl) });
}
