import { z } from 'zod';

import { getApiResponse } from '../api/get-api-response.ts';
import { writeJson } from '../output/write-json.ts';
import { CommandUsageError } from './command-usage-error.ts';

const importResponseSchema = z.object({
  assetId: z.string(),
  kind: z.string(),
  mimeType: z.string(),
  status: z.literal('ready'),
});
const nameSchema = z.string().min(1).max(120);

interface MediaImportInput {
  json: boolean;
  name: string | undefined;
  url: string | undefined;
  videoId: string | undefined;
}

export async function runMedia(arguments_: string[]): Promise<number> {
  try {
    const command = arguments_[0];

    if (command === 'import') {
      await importMedia(arguments_.slice(1));
      return 0;
    }

    if (command === undefined || ((command === '--help' || command === '-h') && arguments_.length === 1)) {
      showMediaHelp();
      return 0;
    }

    throw new CommandUsageError(`Unknown media command: ${command}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Media command failed.';
    process.stderr.write(`Error: ${message}\n`);
    return error instanceof CommandUsageError ? 2 : 1;
  }
}

async function importMedia(arguments_: string[]): Promise<void> {
  if (arguments_.length === 1 && (arguments_[0] === '--help' || arguments_[0] === '-h')) {
    showMediaImportHelp();
    return;
  }

  const options = getMediaImportOptions(arguments_);
  const response = await getApiResponse({
    body: { name: options.name, url: options.url, video_id: options.videoId },
    method: 'POST',
    path: 'media/imports',
    schema: importResponseSchema,
  });

  if (options.json) {
    writeJson(response);
    return;
  }

  process.stdout.write(`Imported ${response.kind} asset ${response.assetId} (${response.mimeType}).\n`);
}

function getMediaImportOptions(arguments_: string[]): {
  json: boolean;
  name: string | undefined;
  url: string;
  videoId: string;
} {
  const input = getMediaImportInput(arguments_);

  if (!input.videoId) {
    throw new CommandUsageError('Media import requires --video-id.');
  }

  if (input.name !== undefined && !nameSchema.safeParse(input.name).success) {
    throw new CommandUsageError('Media import --name must have 1 to 120 characters.');
  }

  return {
    json: input.json,
    name: input.name,
    url: getPublicHttpsUrl(input.url),
    videoId: input.videoId,
  };
}

function getMediaImportInput(arguments_: string[]): MediaImportInput {
  const input: MediaImportInput = { json: false, name: undefined, url: undefined, videoId: undefined };
  const seen = new Set<string>();

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === '--json') {
      guardNewOption(seen, 'json', argument);
      input.json = true;
      continue;
    }

    const property = getMediaProperty(argument);
    if (property) {
      guardNewOption(seen, property, String(argument));
      input[property] = getOptionValue(arguments_, index, String(argument));
      index += 1;
      continue;
    }

    throw new CommandUsageError(`Unknown or repeated media option: ${String(argument)}`);
  }

  return input;
}

function getMediaProperty(
  argument: string | undefined,
): keyof Pick<MediaImportInput, 'name' | 'url' | 'videoId'> | null {
  if (argument === '--name') {
    return 'name';
  }
  if (argument === '--url') {
    return 'url';
  }
  if (argument === '--video-id') {
    return 'videoId';
  }
  return null;
}

function guardNewOption(seen: Set<string>, property: string, option: string): void {
  if (seen.has(property)) {
    throw new CommandUsageError(`Unknown or repeated media option: ${option}`);
  }

  seen.add(property);
}

function getOptionValue(arguments_: string[], index: number, optionName: string): string {
  const value = arguments_[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw new CommandUsageError(`${optionName} requires a value.`);
  }

  return value;
}

function getPublicHttpsUrl(value: string | undefined): string {
  let url: URL;

  try {
    url = new URL(value ?? '');
  } catch {
    throw new CommandUsageError('Media import requires --url with a public HTTPS URL.');
  }

  if (url.protocol !== 'https:' || url.username || url.password || isNonPublicHostname(url.hostname)) {
    throw new CommandUsageError('Media import requires --url with a public HTTPS URL.');
  }

  return url.toString();
}

function isNonPublicHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');

  if (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '::'
    || normalized === '::1'
  ) {
    return true;
  }

  const octets = normalized.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized);
  }

  const firstOctet = octets[0];
  const secondOctet = octets[1];
  if (firstOctet === undefined || secondOctet === undefined) {
    return false;
  }

  return firstOctet === 0
    || firstOctet === 10
    || firstOctet === 127
    || firstOctet >= 224
    || (firstOctet === 100 && secondOctet >= 64 && secondOctet <= 127)
    || (firstOctet === 169 && secondOctet === 254)
    || (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31)
    || (firstOctet === 192 && secondOctet === 168)
    || (firstOctet === 198 && (secondOctet === 18 || secondOctet === 19));
}

function showMediaHelp(): void {
  process.stdout.write(`Usage: viewpress media <command>\n\nCommands:\n  import --video-id <id> --url <https-url> [--name <name>] [--json]\n`);
}

function showMediaImportHelp(): void {
  process.stdout.write('Usage: viewpress media import --video-id <id> --url <https-url> [--name <name>] [--json]\n');
}
