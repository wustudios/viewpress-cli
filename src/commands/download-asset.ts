import { createWriteStream } from 'node:fs';
import { access, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { CommandUsageError } from './command-usage-error.ts';

export async function downloadAsset(urlValue: string, output: string, force: boolean): Promise<void> {
  const url = getDownloadUrl(urlValue);

  if (output === '-') {
    const response = await fetch(url);
    await writeDownloadToStdout(response);
    return;
  }

  if (!force && await pathExists(output)) {
    throw new CommandUsageError(`Output file already exists: ${output}. Use --force to replace it.`);
  }

  await writeDownloadToFile(url, output);
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

async function writeDownloadToFile(url: URL, output: string): Promise<void> {
  const temporaryPath = join(dirname(output), `.${basename(output)}.${crypto.randomUUID()}.tmp`);

  try {
    const response = await fetch(url);
    const body = getDownloadBody(response);
    await pipeline(Readable.fromWeb(body), createWriteStream(temporaryPath, { flags: 'wx' }));
    await rename(temporaryPath, output);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function writeDownloadToStdout(response: Response): Promise<void> {
  const body = getDownloadBody(response);
  const reader = body.getReader();
  let result = await reader.read();

  while (!result.done) {
    await writeStdoutChunk(result.value);
    result = await reader.read();
  }
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
