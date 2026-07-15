import { CliError } from '../cli/cli-error.ts';

export function guardApiKey(apiKey: string): void {
  if (!/^vp_[A-Za-z0-9_-]+$/.test(apiKey)) {
    throw new CliError({
      exitCode: 3,
      message: 'Viewpress API keys start with vp_.',
      type: 'authentication_error',
    });
  }
}
