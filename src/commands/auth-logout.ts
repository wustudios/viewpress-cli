import { removeStoredApiKey } from '../config/remove-stored-api-key.ts';
import { getRuntimeOptions } from '../cli/runtime-options.ts';
import { writeJson } from '../output/write-json.ts';

export async function authLogout(): Promise<void> {
  await removeStoredApiKey();
  if (getRuntimeOptions().json) {
    writeJson({ removed: true });
    return;
  }

  process.stdout.write('Removed the stored API key.\n');

  if (process.env.VIEWPRESS_API_KEY) {
    process.stderr.write('VIEWPRESS_API_KEY is still set and remains active.\n');
  }
}
