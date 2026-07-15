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

  const usesHttps = url.protocol === 'https:';
  const usesLoopbackHttp = url.protocol === 'http:'
    && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');

  if (!usesHttps && !usesLoopbackHttp) {
    throw new CliError({
      exitCode: 2,
      message: 'The Viewpress API URL must use HTTPS, except HTTP is allowed for localhost and 127.0.0.1.',
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
