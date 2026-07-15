import { getApiKeyFromInput } from '../auth/get-api-key-from-input.ts';
import { getConfig } from '../config/get-config.ts';
import { setStoredApiKey } from '../config/set-stored-api-key.ts';
import { getRuntimeOptions } from '../cli/runtime-options.ts';
import { writeJson } from '../output/write-json.ts';

export async function authSetKey(): Promise<void> {
  const config = await getConfig();
  const apiKey = await getApiKeyFromInput();

  await setStoredApiKey(apiKey, config.apiUrl);
  if (getRuntimeOptions().json) {
    writeJson({ apiUrl: config.apiUrl, saved: true });
    return;
  }

  process.stdout.write(`Saved an API key for ${config.apiUrl}.\n`);
}
