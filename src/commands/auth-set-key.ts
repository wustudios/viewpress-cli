import { getApiKeyFromInput } from '../auth/get-api-key-from-input.ts';
import { getConfig } from '../config/get-config.ts';
import { setStoredApiKey } from '../config/set-stored-api-key.ts';

export async function authSetKey(): Promise<void> {
  const config = await getConfig();
  const apiKey = await getApiKeyFromInput();

  await setStoredApiKey(apiKey, config.apiUrl);
  process.stdout.write(`Saved an API key for ${config.apiUrl}.\n`);
}
