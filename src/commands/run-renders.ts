import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { getApiResponse } from '../api/get-api-response.ts';
import { writeJson } from '../output/write-json.ts';
import { writeError } from '../output/write-error.ts';
import { CommandUsageError } from './command-usage-error.ts';

const renderResponseSchema = z.object({
  assetId: z.string(),
  status: z.literal('pending'),
});
const nameSchema = z.string().min(1).max(120);
const timelineSchema = z.looseObject({
  backgroundColor: z.string().optional(),
  durationInFrames: z.number().int().positive(),
  fps: z.number().int().positive().optional(),
  tracks: z.array(z.unknown()).min(1),
});

interface RenderInput {
  json: boolean;
  name: string | undefined;
  timelineFile: string | undefined;
  videoId: string | undefined;
}

export async function runRenders(arguments_: string[]): Promise<number> {
  try {
    const command = arguments_[0];

    if (command === 'create') {
      await createRender(arguments_.slice(1));
      return 0;
    }

    if (command === undefined || ((command === '--help' || command === '-h') && arguments_.length === 1)) {
      showRendersHelp();
      return 0;
    }

    throw new CommandUsageError(`Unknown renders command: ${command}`);
  } catch (error) {
    return writeError(error, 'Renders command failed.');
  }
}

async function createRender(arguments_: string[]): Promise<void> {
  if (arguments_.includes('--help')) {
    showRenderCreateHelp();
    return;
  }

  const input = getRenderInput(arguments_);
  const options = await getRenderOptions(input);
  const response = await getApiResponse({
    body: { name: options.name, timeline: options.timeline, video_id: options.videoId },
    method: 'POST',
    path: 'renders',
    schema: renderResponseSchema,
  });

  if (options.json) {
    writeJson(response);
    return;
  }

  process.stdout.write(`Started render asset ${response.assetId} (${response.status}).\n`);
}

function getRenderInput(arguments_: string[]): RenderInput {
  const input: RenderInput = { json: false, name: undefined, timelineFile: undefined, videoId: undefined };
  const seen = new Set<string>();

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === '--json') {
      guardNewOption(seen, 'json', argument);
      input.json = true;
      continue;
    }

    const property = getRenderProperty(argument);
    if (property) {
      guardNewOption(seen, property, String(argument));
      input[property] = getOptionValue(arguments_, index, String(argument));
      index += 1;
      continue;
    }

    throw new CommandUsageError(`Unknown or repeated renders option: ${String(argument)}`);
  }

  return input;
}

function getRenderProperty(
  argument: string | undefined,
): keyof Pick<RenderInput, 'name' | 'timelineFile' | 'videoId'> | null {
  if (argument === '--name') {
    return 'name';
  }
  if (argument === '--timeline') {
    return 'timelineFile';
  }
  if (argument === '--video-id') {
    return 'videoId';
  }
  return null;
}

function guardNewOption(seen: Set<string>, property: string, option: string): void {
  if (seen.has(property)) {
    throw new CommandUsageError(`Unknown or repeated renders option: ${option}`);
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

async function getRenderOptions(input: RenderInput): Promise<{
  json: boolean;
  name: string;
  timeline: z.infer<typeof timelineSchema>;
  videoId: string;
}> {
  if (!input.videoId) {
    throw new CommandUsageError('Renders create requires --video-id.');
  }

  const name = nameSchema.safeParse(input.name);
  if (!name.success) {
    throw new CommandUsageError('Renders create requires --name with 1 to 120 characters.');
  }

  if (input.timelineFile === undefined) {
    throw new CommandUsageError('Renders create requires --timeline <file|->.');
  }

  const timelineText = await readTimeline(input.timelineFile);
  const timeline = parseTimeline(timelineText);
  return { json: input.json, name: name.data, timeline, videoId: input.videoId };
}

async function readTimeline(timelineFile: string): Promise<string> {
  if (timelineFile === '-') {
    return new Response(Bun.stdin.stream()).text();
  }

  return readFile(timelineFile, 'utf8');
}

function parseTimeline(timelineText: string): z.infer<typeof timelineSchema> {
  let value: unknown;

  try {
    value = JSON.parse(timelineText);
  } catch {
    throw new CommandUsageError('Renders --timeline must contain valid JSON.');
  }

  const timeline = timelineSchema.safeParse(value);
  if (!timeline.success) {
    throw new CommandUsageError(
      'Renders --timeline must be an object with at least one track and a positive integer durationInFrames; fps must be a positive integer when provided.',
    );
  }

  return timeline.data;
}

function showRendersHelp(): void {
  process.stdout.write(`Usage: viewpress renders <command>\n\nCommands:\n  create --video-id <id> --name <name> --timeline <file|-> [--json]\n`);
}

function showRenderCreateHelp(): void {
  process.stdout.write('Usage: viewpress renders create --video-id <id> --name <name> --timeline <file|-> [--json]\n');
}
