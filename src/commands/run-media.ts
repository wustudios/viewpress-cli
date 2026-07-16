import { z } from 'zod';

import { getApiResponse } from '../api/get-api-response.ts';
import { getRuntimeOptions } from '../cli/runtime-options.ts';
import { writeJson } from '../output/write-json.ts';
import { writeError } from '../output/write-error.ts';
import { CommandUsageError } from './command-usage-error.ts';

const importResponseSchema = z.object({
  assetId: z.string(),
  kind: z.string(),
  mimeType: z.string(),
  status: z.literal('ready'),
});
const nameSchema = z.string().min(1).max(120);

interface MediaImportInput {
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

    if (command === undefined || (command === '--help' && arguments_.length === 1)) {
      showMediaHelp();
      return 0;
    }

    throw new CommandUsageError(`Unknown media command: ${command}`);
  } catch (error) {
    if (error instanceof CommandUsageError && error.commandPath === undefined) {
      return writeError(
        new CommandUsageError(error.message, getMediaCommandPath(arguments_[0])),
        'Media command failed.',
      );
    }
    return writeError(error, 'Media command failed.');
  }
}

function getMediaCommandPath(command: string | undefined): string {
  if (command === 'import') {
    return 'media import';
  }
  return 'media';
}

async function importMedia(arguments_: string[]): Promise<void> {
  if (arguments_.includes('--help')) {
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

  if (getRuntimeOptions().json) {
    writeJson(response);
    return;
  }

  process.stdout.write(`Imported ${response.kind} asset ${response.assetId} (${response.mimeType}).\n`);
}

function getMediaImportOptions(arguments_: string[]): {
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
    name: input.name,
    url: getPublicHttpsUrl(input.url),
    videoId: input.videoId,
  };
}

function getMediaImportInput(arguments_: string[]): MediaImportInput {
  const input: MediaImportInput = { name: undefined, url: undefined, videoId: undefined };
  const seen = new Set<string>();

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

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
  const normalized = hostname.toLowerCase().replace(/\.$/, '');

  if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
    return true;
  }

  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    return isPrivateIpv6(normalized.slice(1, -1));
  }

  const octets = normalized.split('.').map(Number);
  const firstOctet = octets[0];
  const secondOctet = octets[1];
  if (octets.length !== 4 || firstOctet === undefined || secondOctet === undefined
    || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  return isPrivateIpv4(firstOctet, secondOctet);
}

function isPrivateIpv4(firstOctet: number, secondOctet: number): boolean {
  if (firstOctet === 0 || firstOctet === 10 || firstOctet === 127 || firstOctet >= 224) {
    return true;
  }
  if (firstOctet === 100) {
    return secondOctet >= 64 && secondOctet <= 127;
  }
  if (firstOctet === 169) {
    return secondOctet === 254;
  }
  if (firstOctet === 172) {
    return secondOctet >= 16 && secondOctet <= 31;
  }
  if (firstOctet === 192) {
    return secondOctet === 168;
  }
  if (firstOctet === 198) {
    return secondOctet === 18 || secondOctet === 19;
  }
  return false;
}

function isPrivateIpv6(address: string): boolean {
  if (address === '::' || address === '::1') {
    return true;
  }
  return address.startsWith('fc') || address.startsWith('fd') || /^fe[89ab]/.test(address);
}

function showMediaHelp(): void {
  process.stdout.write(`Usage: viewpress media <command>\n\nCommands:\n  import --video-id <id> --url <https-url> [--name <name>] [--json]\n`);
}

function showMediaImportHelp(): void {
  process.stdout.write('Usage: viewpress media import --video-id <id> --url <https-url> [--name <name>] [--json]\n');
}
