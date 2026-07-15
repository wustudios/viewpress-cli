import { getConfig } from '../config/get-config.ts';

export async function authStatus(): Promise<number> {
  const config = await getConfig();

  process.stdout.write(`Server: ${config.apiUrl}\n`);

  if (config.apiKeySource === 'environment') {
    process.stdout.write('Authentication: VIEWPRESS_API_KEY\n');
    return 0;
  }

  if (config.apiKeySource === 'file') {
    process.stdout.write('Authentication: stored API key\n');
    return 0;
  }

  process.stdout.write('Authentication: not signed in\n');
  return 1;
}
