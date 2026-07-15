import { z } from 'zod';

import { getApiResponse } from '../api/get-api-response.ts';
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
  json: boolean;
  limit?: number;
  projectId: string;
  query?: string;
}

export async function runVoices(arguments_: string[]): Promise<number> {
  try {
    const command = arguments_[0];

    if (command === 'list') {
      await listVoices(arguments_.slice(1));
      return 0;
    }

    if (command === undefined) {
      showVoicesHelp();
      return 0;
    }

    if ((command === '--help' || command === '-h') && arguments_.length === 1) {
      showVoicesHelp();
      return 0;
    }

    throw new CommandUsageError(`Unknown voices command: ${command}`);
  } catch (error) {
    return writeError(error, 'Voices command failed.');
  }
}

async function listVoices(arguments_: string[]): Promise<void> {
  const options = getVoiceOptions(arguments_);
  const query = getVoiceQuery(options);
  const response = await getApiResponse({ method: 'GET', path: 'voices', query, schema: voicesResponseSchema });

  if (options.json) {
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
  let gender: string | undefined;
  let json = false;
  let limit: string | undefined;
  let projectId: string | undefined;
  let query: string | undefined;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === '--json' && !json) {
      json = true;
      continue;
    }

    if (argument === '--project-id' && projectId === undefined) {
      projectId = getOptionValue(arguments_, index, '--project-id');
      index += 1;
      continue;
    }

    if (argument === '--query' && query === undefined) {
      query = getOptionValue(arguments_, index, '--query');
      index += 1;
      continue;
    }

    if (argument === '--gender' && gender === undefined) {
      gender = getOptionValue(arguments_, index, '--gender');
      index += 1;
      continue;
    }

    if (argument === '--limit' && limit === undefined) {
      limit = getOptionValue(arguments_, index, '--limit');
      index += 1;
      continue;
    }

    throw new CommandUsageError(`Unknown or repeated voices list option: ${String(argument)}`);
  }

  return getValidatedVoiceOptions({ gender, json, limit, projectId, query });
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
  json: boolean;
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
  options: { json: boolean; projectId: string; query: string | undefined },
  gender: 'male' | 'female' | 'neutral' | undefined,
  limit: number | undefined,
): VoiceOptions {
  return {
    ...(gender === undefined ? {} : { gender }),
    json: options.json,
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
