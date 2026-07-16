import { getConfig } from '../config/get-config.ts';
import { getRuntimeOptions } from '../cli/runtime-options.ts';
import { writeJson } from '../output/write-json.ts';

export async function authStatus(): Promise<number> {
  const config = await getConfig();

  if (getRuntimeOptions().json) {
    if (config.apiKeySource) {
      writeJson({ apiUrl: config.apiUrl, authenticated: true, source: config.apiKeySource });
      return 0;
    }
    writeJson({ apiUrl: config.apiUrl, authenticated: false });
    return 3;
  }

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
  process.stdout.write('Set VIEWPRESS_API_KEY or pipe a key to `viewpress auth set-key`.\n');
  return 3;
}
