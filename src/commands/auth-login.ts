import { loginWithBrowser } from '../auth/login-with-browser.ts';
import { getConfig } from '../config/get-config.ts';
import { setStoredApiKey } from '../config/set-stored-api-key.ts';

export async function authLogin(): Promise<void> {
  const config = await getConfig();
  const apiKey = await loginWithBrowser({ apiUrl: config.apiUrl });

  await setStoredApiKey(apiKey, config.apiUrl);
  process.stdout.write(`Signed in to ${config.apiUrl}.\n`);
}
