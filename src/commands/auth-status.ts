import { getConfig } from '../config/get-config.ts';
import { CliError } from '../cli/cli-error.ts';
import { getRuntimeOptions } from '../cli/runtime-options.ts';
import { writeJson } from '../output/write-json.ts';

export async function authStatus(): Promise<number> {
  const config = await getConfig();

  if (getRuntimeOptions().json && config.apiKeySource) {
    writeJson({ apiUrl: config.apiUrl, authenticated: true, source: config.apiKeySource });
    return 0;
  }

  if (getRuntimeOptions().json) {
    throw new CliError({
      exitCode: 3,
      message: 'No Viewpress credentials are configured.',
      type: 'authentication_error',
    });
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
  return 3;
}
