import { loginWithBrowser } from '../auth/login-with-browser.ts';
import { getRuntimeOptions } from '../cli/runtime-options.ts';
import { CommandUsageError } from './command-usage-error.ts';
import { getConfig } from '../config/get-config.ts';
import { setStoredApiKey } from '../config/set-stored-api-key.ts';

export async function authLogin(): Promise<void> {
  if (getRuntimeOptions().nonInteractive) {
    throw new CommandUsageError(
      'Browser login is unavailable in non-interactive mode, and its server contract is not available in production. Use VIEWPRESS_API_KEY or pipe a key to `viewpress auth set-key`.',
    );
  }

  const config = await getConfig();
  const apiKey = await loginWithBrowser({ apiUrl: config.apiUrl });

  await setStoredApiKey(apiKey, config.apiUrl);
  process.stdout.write(`Signed in to ${config.apiUrl}.\n`);
}
