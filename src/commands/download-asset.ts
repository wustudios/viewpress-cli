import { createWriteStream } from 'node:fs';
import { access, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { CliError } from '../cli/cli-error.ts';
import { getRuntimeOptions } from '../cli/runtime-options.ts';
import { getExitCode } from '../output/get-exit-code.ts';
import { CommandUsageError } from './command-usage-error.ts';

const maxRedirectCount = 5;

interface DownloadRequest {
  signal: AbortSignal;
  timeoutSec: number;
  url: URL;
}

interface DownloadResponse {
  response: Response;
  signal: AbortSignal;
  timeoutSec: number;
}

interface FileDownload {
  body: ReadableStream<Uint8Array>;
  download: DownloadResponse;
  output: string;
}

export async function downloadAsset(urlValue: string, output: string, force: boolean): Promise<void> {
  const url = getDownloadUrl(urlValue);

  if (output === '-') {
    const download = await fetchDownload(url);
    await writeDownloadToStdout(download);
    return;
  }

  if (!force && await pathExists(output)) {
    throw new CommandUsageError(`Output file already exists: ${output}. Use --force to replace it.`);
  }

  const download = await fetchDownload(url);
  const body = getDownloadBody(download.response);
  await writeDownloadToFile({ body, download, output });
}

function getDownloadUrl(value: string): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('Viewpress returned an invalid asset download URL.');
  }

  const isLoopbackHttp = url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === '::1');
  if (url.protocol !== 'https:' && !isLoopbackHttp) {
    throw new Error('Viewpress returned an insecure asset download URL.');
  }

  if (url.username || url.password) {
    throw new Error('Viewpress returned an asset download URL containing credentials.');
  }

  return url;
}

async function writeDownloadToFile(values: FileDownload): Promise<void> {
  const temporaryPath = join(dirname(values.output), `.${basename(values.output)}.${crypto.randomUUID()}.tmp`);

  try {
    await pipeline(Readable.fromWeb(values.body), createWriteStream(temporaryPath, { flags: 'wx' }));
    await rename(temporaryPath, values.output);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw getDownloadStreamError(error, values.download);
  }
}

async function fetchDownload(url: URL): Promise<DownloadResponse> {
  const timeoutSec = getRuntimeOptions().timeoutSec;
  const signal = AbortSignal.timeout(timeoutSec * 1_000);
  let downloadUrl = url;

  for (let redirectCount = 0; redirectCount <= maxRedirectCount; redirectCount += 1) {
    const response = await fetchDownloadResponse({ signal, timeoutSec, url: downloadUrl });
    if (!isRedirectResponse(response)) {
      return { response, signal, timeoutSec };
    }
    if (redirectCount === maxRedirectCount) {
      throw new Error(`Asset download exceeded ${String(maxRedirectCount)} redirects.`);
    }
    downloadUrl = getRedirectUrl(response, downloadUrl);
  }
  throw new Error('Asset download redirect handling failed.');
}

async function fetchDownloadResponse(request: DownloadRequest): Promise<Response> {
  try {
    return await fetch(request.url, { redirect: 'manual', signal: request.signal });
  } catch (error) {
    if (request.signal.aborted) {
      throw new CliError({
        exitCode: 4, message: `Request timed out after ${String(request.timeoutSec)} seconds.`, type: 'timeout_error',
      });
    }
    const message = error instanceof Error ? error.message : 'Could not download the asset.';
    throw new CliError({ exitCode: 5, message, type: 'transport_error' });
  }
}

function isRedirectResponse(response: Response): boolean {
  return response.status === 301
    || response.status === 302
    || response.status === 303
    || response.status === 307
    || response.status === 308;
}

function getRedirectUrl(response: Response, sourceUrl: URL): URL {
  const location = response.headers.get('Location');
  if (!location) {
    throw new Error('Asset download returned a redirect without a location.');
  }
  let value: string;
  try {
    value = new URL(location, sourceUrl).href;
  } catch {
    throw new Error('Viewpress returned an invalid asset download URL.');
  }
  const redirectUrl = getDownloadUrl(value);
  if (sourceUrl.protocol === 'https:' && redirectUrl.protocol !== 'https:') {
    throw new Error('Viewpress returned an insecure asset download redirect.');
  }
  return redirectUrl;
}

async function writeDownloadToStdout(download: DownloadResponse): Promise<void> {
  const body = getDownloadBody(download.response);
  try {
    const reader = body.getReader();
    let result = await reader.read();
    while (!result.done) {
      await writeStdoutChunk(result.value);
      result = await reader.read();
    }
  } catch (error) {
    throw getDownloadStreamError(error, download);
  }
}

function getDownloadStreamError(error: unknown, download: DownloadResponse): Error {
  if (error instanceof CliError) {
    return error;
  }
  if (error instanceof Error && getExitCode(error) === 6) {
    return error;
  }
  if (download.signal.aborted) {
    return new CliError({
      exitCode: 4,
      message: `Request timed out after ${String(download.timeoutSec)} seconds.`,
      type: 'timeout_error',
    });
  }
  const message = error instanceof Error ? error.message : 'The asset download was interrupted.';
  return new CliError({ exitCode: 5, message, type: 'transport_error' });
}

function getDownloadBody(response: Response): ReadableStream<Uint8Array> {
  if (!response.ok) {
    throw new Error(`Asset download returned status ${String(response.status)}.`);
  }

  if (!response.body) {
    throw new Error('Asset download returned an empty response body.');
  }

  return response.body;
}

function writeStdoutChunk(chunk: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    process.stdout.write(chunk, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
