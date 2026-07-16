import { findStoredConfig } from '../config/find-stored-config.ts';
import { removeStoredApiKey } from '../config/remove-stored-api-key.ts';
import { getRuntimeOptions } from '../cli/runtime-options.ts';
import { writeJson } from '../output/write-json.ts';

export async function authLogout(): Promise<void> {
  const storedConfig = await findStoredConfig();
  const removed = Boolean(storedConfig?.api_key);
  await removeStoredApiKey();

  if (getRuntimeOptions().json) {
    writeJson({ removed });
    return;
  }

  if (removed) {
    process.stdout.write('Removed the stored API key.\n');
  } else {
    process.stdout.write('No API key is stored.\n');
  }

  if (process.env.VIEWPRESS_API_KEY) {
    process.stderr.write('VIEWPRESS_API_KEY is still set and remains active.\n');
  }
}
