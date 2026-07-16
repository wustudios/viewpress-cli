import { z } from 'zod';

import { getApiResponse } from '../api/get-api-response.ts';
import { getRuntimeOptions } from '../cli/runtime-options.ts';
import { writeJson } from '../output/write-json.ts';
import { writeError } from '../output/write-error.ts';
import { CommandUsageError } from './command-usage-error.ts';

const voiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  gender: z.string().optional(),
  age: z.string().optional(),
  language: z.string().optional(),
  type: z.string().optional(),
});
const voicesResponseSchema = z.object({
  voices: z.array(voiceSchema),
  presets: z.array(z.string()),
});
const genderSchema = z.enum(['male', 'female', 'neutral']);

interface VoiceOptions {
  gender?: 'male' | 'female' | 'neutral';
  limit?: number;
  projectId: string;
  query?: string;
}

interface VoiceInput {
  gender: string | undefined;
  limit: string | undefined;
  projectId: string | undefined;
  query: string | undefined;
}

interface VoiceArgument {
  arguments_: string[];
  index: number;
  input: VoiceInput;
  seen: Set<string>;
}

export async function runVoices(arguments_: string[]): Promise<number> {
  try {
    const command = arguments_[0];

    if (command === 'list') {
      if (arguments_.includes('--help')) {
        showVoicesHelp();
        return 0;
      }
      await listVoices(arguments_.slice(1));
      return 0;
    }

    if (command === undefined || (command === '--help' && arguments_.length === 1)) {
      if (getRuntimeOptions().json) {
        throw new CommandUsageError('A voices command is required with --json.');
      }
      showVoicesHelp();
      return 0;
    }

    throw new CommandUsageError(`Unknown voices command: ${command}`);
  } catch (error) {
    if (error instanceof CommandUsageError && error.commandPath === undefined) {
      return writeError(
        new CommandUsageError(error.message, getVoicesCommandPath(arguments_[0])),
        'Voices command failed.',
      );
    }
    return writeError(error, 'Voices command failed.');
  }
}

function getVoicesCommandPath(command: string | undefined): string {
  if (command === 'list') {
    return 'voices list';
  }
  return 'voices';
}

async function listVoices(arguments_: string[]): Promise<void> {
  const options = getVoiceOptions(arguments_);
  const query = getVoiceQuery(options);
  const response = await getApiResponse({ method: 'GET', path: 'voices', query, schema: voicesResponseSchema });

  if (getRuntimeOptions().json) {
    writeJson(response);
    return;
  }

  for (const voice of response.voices) {
    process.stdout.write(`${voice.id}\t${voice.name}\t${voice.gender ?? ''}\t${voice.language ?? ''}\n`);
  }

  for (const preset of response.presets) {
    process.stdout.write(`preset\t${preset}\n`);
  }
}

function getVoiceOptions(arguments_: string[]): VoiceOptions {
  const input = getVoiceInput(arguments_);
  return getValidatedVoiceOptions(input);
}

function getVoiceInput(arguments_: string[]): VoiceInput {
  const input: VoiceInput = {
    gender: undefined, limit: undefined, projectId: undefined, query: undefined,
  };
  const seen = new Set<string>();
  for (let index = 0; index < arguments_.length; index += 1) {
    index = readVoiceArgument({ arguments_, index, input, seen });
  }
  return input;
}

function readVoiceArgument(values: VoiceArgument): number {
  const { arguments_, index, input, seen } = values;
  const argument = arguments_[index];
  const property = getVoiceProperty(argument);
  if (!property) {
    throw new CommandUsageError(`Unknown or repeated voices list option: ${String(argument)}`);
  }
  guardNewVoiceOption(seen, property, String(argument));
  input[property] = getOptionValue(arguments_, index, String(argument));
  return index + 1;
}

function getVoiceProperty(argument: string | undefined): keyof Pick<
  VoiceInput,
  'gender' | 'limit' | 'projectId' | 'query'
> | null {
  if (argument === '--project-id') {
    return 'projectId';
  }
  if (argument === '--query') {
    return 'query';
  }
  if (argument === '--gender') {
    return 'gender';
  }
  if (argument === '--limit') {
    return 'limit';
  }
  return null;
}

function guardNewVoiceOption(seen: Set<string>, property: string, option: string): void {
  if (seen.has(property)) {
    throw new CommandUsageError(`Unknown or repeated voices list option: ${option}`);
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

function getValidatedVoiceOptions(options: {
  gender: string | undefined;
  limit: string | undefined;
  projectId: string | undefined;
  query: string | undefined;
}): VoiceOptions {
  if (!options.projectId) {
    throw new CommandUsageError('Voices list requires --project-id.');
  }

  const projectId = options.projectId;

  const parsedGender = genderSchema.safeParse(options.gender);

  if (options.gender !== undefined && !parsedGender.success) {
    throw new CommandUsageError('Voice gender must be male, female, or neutral.');
  }

  const limit = getLimit(options.limit);
  return getVoiceOptionsResult({ ...options, projectId }, parsedGender.data, limit);
}

function getLimit(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new CommandUsageError('Voice limit must be an integer from 1 to 50.');
  }

  return limit;
}

function getVoiceOptionsResult(
  options: { projectId: string; query: string | undefined },
  gender: 'male' | 'female' | 'neutral' | undefined,
  limit: number | undefined,
): VoiceOptions {
  return {
    ...(gender === undefined ? {} : { gender }),
    ...(limit === undefined ? {} : { limit }),
    projectId: options.projectId,
    ...(options.query === undefined ? {} : { query: options.query }),
  };
}

function getVoiceQuery(options: VoiceOptions): URLSearchParams {
  const query = new URLSearchParams({ project_id: options.projectId });

  if (options.query !== undefined) {
    query.set('query', options.query);
  }

  if (options.gender !== undefined) {
    query.set('gender', options.gender);
  }

  if (options.limit !== undefined) {
    query.set('limit', String(options.limit));
  }

  return query;
}

function showVoicesHelp(): void {
  process.stdout.write(
    'Usage: viewpress voices list --project-id <id> [--query <text>] [--gender <male|female|neutral>] [--limit <1-50>] [--json]\n',
  );
}
