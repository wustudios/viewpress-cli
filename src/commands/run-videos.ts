import { z } from 'zod';

import { getApiResponse } from '../api/get-api-response.ts';
import { getRuntimeOptions } from '../cli/runtime-options.ts';
import { writeJson } from '../output/write-json.ts';
import { writeTable } from '../output/write-table.ts';
import { writeError } from '../output/write-error.ts';
import { CommandUsageError } from './command-usage-error.ts';
import { runVideoGeneration } from './run-video-generation.ts';
import { runVideoStyleTool } from './run-video-style-tool.ts';

const videosResponseSchema = z.object({
  videos: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      createdAt: z.string(),
    }),
  ),
});
const videoResponseSchema = z.object({ id: z.string(), name: z.string(), url: z.string() });
const videoNameSchema = z.string().min(1).max(120);

interface ListVideosInput {
  projectId: string | undefined;
}

interface CreateVideoInput {
  name: string | undefined;
  projectId: string | undefined;
}

export async function runVideos(arguments_: string[]): Promise<number> {
  try {
    const command = arguments_[0];

    if (command === 'list') {
      if (arguments_.includes('--help')) {
        showVideoCommandHelp(command);
        return 0;
      }
      await listVideos(arguments_.slice(1));
      return 0;
    }

    if (command === 'create') {
      if (arguments_.includes('--help')) {
        showVideoCommandHelp(command);
        return 0;
      }
      await createVideo(arguments_.slice(1));
      return 0;
    }

    if (command === 'generate' || command === 'estimate') {
      await runVideoGeneration(command, arguments_.slice(1));
      return 0;
    }

    if (
      command === 'motion-transfer' ||
      command === 'talking-image' ||
      command === 'ugc-ad' ||
      command === 'timelapse-scene'
    ) {
      await runVideoStyleTool(command, arguments_.slice(1));
      return 0;
    }

    if (command === undefined || (command === '--help' && arguments_.length === 1)) {
      if (getRuntimeOptions().json) {
        throw new CommandUsageError('A videos command is required with --json.');
      }
      showVideosHelp();
      return 0;
    }

    throw new CommandUsageError(`Unknown videos command: ${command}`);
  } catch (error) {
    if (error instanceof CommandUsageError && error.commandPath === undefined) {
      return writeError(
        new CommandUsageError(error.message, getVideosCommandPath(arguments_[0])),
        'Videos command failed.',
      );
    }
    return writeError(error, 'Videos command failed.');
  }
}

function getVideosCommandPath(command: string | undefined): string {
  if (
    command === 'list' ||
    command === 'create' ||
    command === 'generate' ||
    command === 'estimate' ||
    command === 'motion-transfer' ||
    command === 'talking-image' ||
    command === 'ugc-ad' ||
    command === 'timelapse-scene'
  ) {
    return `videos ${command}`;
  }
  return 'videos';
}

async function listVideos(arguments_: string[]): Promise<void> {
  const options = getListVideosOptions(arguments_);
  const query = new URLSearchParams({ project_id: options.projectId });
  const response = await getApiResponse({ method: 'GET', path: 'videos', query, schema: videosResponseSchema });

  if (getRuntimeOptions().json) {
    writeJson(response);
    return;
  }

  if (response.videos.length === 0) {
    process.stdout.write('No videos.\n');
    return;
  }

  writeTable(response.videos.map((video) => [
    video.id,
    video.name,
    new Date(video.createdAt).toISOString(),
    video.url,
  ]));
}

async function createVideo(arguments_: string[]): Promise<void> {
  const options = getCreateVideoOptions(arguments_);
  const response = await getApiResponse({
    body: { name: options.name, project_id: options.projectId },
    method: 'POST',
    path: 'videos',
    schema: videoResponseSchema,
  });

  if (getRuntimeOptions().json) {
    writeJson(response);
    return;
  }

  process.stdout.write(`Created video ${response.name} (${response.id}).\n${response.url}\n`);
}

function getListVideosOptions(arguments_: string[]): { projectId: string } {
  const input = getListVideosInput(arguments_);
  if (!input.projectId) {
    throw new CommandUsageError('Videos commands require --project-id.');
  }

  return { projectId: input.projectId };
}

function getListVideosInput(arguments_: string[]): ListVideosInput {
  const input: ListVideosInput = { projectId: undefined };
  const seen = new Set<string>();

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    const property = getListVideosProperty(argument);
    if (!property) {
      throwUnknownArgument(argument);
    }
    guardNewOption(seen, property, String(argument));
    input[property] = getOptionValue(arguments_, index, String(argument));
    index += 1;
  }

  return input;
}

function getListVideosProperty(argument: string | undefined): keyof ListVideosInput | null {
  if (argument === '--project-id') {
    return 'projectId';
  }
  return null;
}

function getCreateVideoOptions(arguments_: string[]): { name: string; projectId: string } {
  const input = getCreateVideoInput(arguments_);
  if (!input.projectId) {
    throw new CommandUsageError('Videos commands require --project-id.');
  }

  const parsedName = videoNameSchema.safeParse(input.name);
  if (!parsedName.success) {
    throw new CommandUsageError('Videos create requires --name with 1 to 120 characters.');
  }

  return { name: parsedName.data, projectId: input.projectId };
}

function getCreateVideoInput(arguments_: string[]): CreateVideoInput {
  const input: CreateVideoInput = { name: undefined, projectId: undefined };
  const seen = new Set<string>();

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    const property = getCreateVideoProperty(argument);
    if (!property) {
      throwUnknownArgument(argument);
    }
    guardNewOption(seen, property, String(argument));
    input[property] = getOptionValue(arguments_, index, String(argument));
    index += 1;
  }

  return input;
}

function getCreateVideoProperty(argument: string | undefined): keyof CreateVideoInput | null {
  if (argument === '--name') {
    return 'name';
  }
  if (argument === '--project-id') {
    return 'projectId';
  }
  return null;
}

function guardNewOption(seen: Set<string>, property: string, option: string): void {
  if (seen.has(property)) {
    throw new CommandUsageError(`Flag ${option} cannot be repeated.`);
  }

  seen.add(property);
}

function throwUnknownArgument(argument: string | undefined): never {
  const value = String(argument);
  if (value.startsWith('-')) {
    throw new CommandUsageError(`Unknown flag: ${value}`);
  }
  throw new CommandUsageError(`Unexpected argument: ${value}`);
}

function getOptionValue(arguments_: string[], index: number, optionName: string): string {
  const value = arguments_[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw new CommandUsageError(`${optionName} requires a value.`);
  }

  return value;
}

function showVideosHelp(): void {
  process.stdout.write(`Usage: viewpress videos <command>

Commands:
  list             List videos in a project
  create           Create a video
  generate         Generate a video from a prompt
  estimate         Estimate video generation credits
  motion-transfer  Apply a motion video's movement to an image
  talking-image    Make an image speak an audio track
  ugc-ad           Generate a UGC-style ad video
  timelapse-scene  Generate a timelapse from a start image

Run 'viewpress videos <command> --help' for full options.
`);
}

function showVideoCommandHelp(command: 'create' | 'list'): void {
  if (command === 'list') {
    process.stdout.write('Usage: viewpress videos list --project-id <id> [--json]\n');
    return;
  }

  process.stdout.write('Usage: viewpress videos create --project-id <id> --name <name> [--json]\n');
}
