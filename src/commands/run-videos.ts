import { z } from 'zod';

import { getApiResponse } from '../api/get-api-response.ts';
import { writeJson } from '../output/write-json.ts';
import { CommandUsageError } from './command-usage-error.ts';

const videosResponseSchema = z.object({
  videos: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      createdAt: z.iso.datetime(),
    }),
  ),
});
const videoResponseSchema = z.object({ id: z.string(), name: z.string(), url: z.string() });
const videoNameSchema = z.string().min(1).max(120);

export async function runVideos(arguments_: string[]): Promise<number> {
  try {
    const command = arguments_[0];

    if (command === 'list') {
      await listVideos(arguments_.slice(1));
      return 0;
    }

    if (command === 'create') {
      await createVideo(arguments_.slice(1));
      return 0;
    }

    if (command === undefined) {
      showVideosHelp();
      return 0;
    }

    if ((command === '--help' || command === '-h') && arguments_.length === 1) {
      showVideosHelp();
      return 0;
    }

    throw new CommandUsageError(`Unknown videos command: ${command}`);
  } catch (error) {
    return writeError(error);
  }
}

async function listVideos(arguments_: string[]): Promise<void> {
  const options = getVideoOptions(arguments_, false);
  const query = new URLSearchParams({ project_id: options.projectId });
  const response = await getApiResponse({ method: 'GET', path: 'videos', query, schema: videosResponseSchema });

  if (options.json) {
    writeJson(response);
    return;
  }

  if (response.videos.length === 0) {
    process.stdout.write('No videos.\n');
    return;
  }

  for (const video of response.videos) {
    process.stdout.write(`${video.id}\t${video.name}\t${video.createdAt}\t${video.url}\n`);
  }
}

async function createVideo(arguments_: string[]): Promise<void> {
  const options = getVideoOptions(arguments_, true);
  const response = await getApiResponse({
    body: { name: options.name, project_id: options.projectId },
    method: 'POST',
    path: 'videos',
    schema: videoResponseSchema,
  });

  if (options.json) {
    writeJson(response);
    return;
  }

  process.stdout.write(`Created video ${response.name} (${response.id}).\n${response.url}\n`);
}

function getVideoOptions(
  arguments_: string[],
  needsName: boolean,
): { json: boolean; name?: string; projectId: string } {
  let json = false;
  let name: string | undefined;
  let projectId: string | undefined;

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

    if (needsName && argument === '--name' && name === undefined) {
      name = getOptionValue(arguments_, index, '--name');
      index += 1;
      continue;
    }

    throw new CommandUsageError(`Unknown or repeated videos option: ${String(argument)}`);
  }

  return getValidatedVideoOptions({ json, name, needsName, projectId });
}

function getOptionValue(arguments_: string[], index: number, optionName: string): string {
  const value = arguments_[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw new CommandUsageError(`${optionName} requires a value.`);
  }

  return value;
}

function getValidatedVideoOptions(options: {
  json: boolean;
  name: string | undefined;
  needsName: boolean;
  projectId: string | undefined;
}): { json: boolean; name?: string; projectId: string } {
  if (!options.projectId) {
    throw new CommandUsageError('Videos commands require --project-id.');
  }

  if (!options.needsName) {
    return { json: options.json, projectId: options.projectId };
  }

  const parsedName = videoNameSchema.safeParse(options.name);

  if (!parsedName.success) {
    throw new CommandUsageError('Videos create requires --name with 1 to 120 characters.');
  }

  return { json: options.json, name: parsedName.data, projectId: options.projectId };
}

function showVideosHelp(): void {
  process.stdout.write(`Usage: viewpress videos <command>\n\nCommands:\n  list --project-id <id> [--json]\n  create --project-id <id> --name <name> [--json]\n`);
}

function writeError(error: unknown): number {
  const message = error instanceof Error ? error.message : 'Videos command failed.';
  process.stderr.write(`Error: ${message}\n`);
  return error instanceof CommandUsageError ? 2 : 1;
}
