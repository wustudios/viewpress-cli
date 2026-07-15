import { CliError } from '../cli/cli-error.ts';

export function getApiUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throwInvalidApiUrl();
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new CliError({
      exitCode: 2,
      message: 'The Viewpress API URL must not contain credentials, a query, or a fragment.',
      type: 'config_error',
    });
  }

  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new CliError({
      exitCode: 2,
      message: 'The Viewpress API URL must use HTTPS unless it is localhost.',
      type: 'config_error',
    });
  }

  return url.toString().replace(/\/$/, '');
}

function throwInvalidApiUrl(): never {
  throw new CliError({
    exitCode: 2,
    message: 'The Viewpress API URL is invalid.',
    type: 'config_error',
  });
}
