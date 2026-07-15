import { removeStoredApiKey } from '../config/remove-stored-api-key.ts';

export async function authLogout(): Promise<void> {
  await removeStoredApiKey();
  process.stdout.write('Removed the stored API key.\n');

  if (process.env.VIEWPRESS_API_KEY) {
    process.stderr.write('VIEWPRESS_API_KEY is still set and remains active.\n');
  }
}
