import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { getApiResponse } from '../api/get-api-response.ts';
import { writeJson } from '../output/write-json.ts';
import { CommandUsageError } from './command-usage-error.ts';

const videoGenerationResponseSchema = z.object({
  assetId: z.string().optional(),
  credits: z.number().optional(),
  status: z.enum(['pending', 'estimate']),
});
const videoNameSchema = z.string().min(1).max(120);
const videoPromptSchema = z.string().min(3);
const videoModelSchema = z.enum([
  'V-STANDARD',
  'V-LITE',
  'V-PRO',
  'V-PRO-TRANSITION',
  'V-ULTRA',
  'V-UGC',
]);
const aspectRatioSchema = z.enum(['1:1', '9:16', '16:9']);
const durationSecSchema = z.number().min(1).max(15);

interface VideoGenerationInput {
  aspectRatio: string;
  durationSec: string | undefined;
  endImageAssetId: string | undefined;
  json: boolean;
  model: string | undefined;
  name: string | undefined;
  negativePrompt: string | undefined;
  prompt: string | undefined;
  promptFile: string | undefined;
  referenceAudioAssetIds: string[];
  referenceImageAssetIds: string[];
  referenceVideoAssetIds: string[];
  startImageAssetId: string | undefined;
  videoId: string | undefined;
  withAudio: boolean;
}

interface VideoGenerationOptions {
  aspectRatio: z.infer<typeof aspectRatioSchema>;
  durationSec: number;
  endImageAssetId: string | undefined;
  json: boolean;
  model: z.infer<typeof videoModelSchema>;
  name: string;
  negativePrompt: string | undefined;
  prompt: string;
  referenceAudioAssetIds: string[];
  referenceImageAssetIds: string[];
  referenceVideoAssetIds: string[];
  startImageAssetId: string | undefined;
  videoId: string;
  withAudio: boolean;
}

interface VideoGenerationArgument {
  arguments_: string[];
  index: number;
  input: VideoGenerationInput;
  seen: Set<string>;
}

export async function runVideoGeneration(command: 'estimate' | 'generate', arguments_: string[]): Promise<void> {
  if (arguments_.length === 1 && (arguments_[0] === '--help' || arguments_[0] === '-h')) {
    showVideoGenerationHelp(command);
    return;
  }

  const options = await getVideoGenerationOptions(arguments_);
  const response = await getApiResponse({
    body: {
      aspect_ratio: options.aspectRatio,
      duration_sec: options.durationSec,
      end_image_asset_id: options.endImageAssetId,
      estimate_only: command === 'estimate',
      model: options.model,
      name: options.name,
      negative_prompt: options.negativePrompt,
      prompt: options.prompt,
      reference_audio_asset_ids: getOptionalIds(options.referenceAudioAssetIds),
      reference_image_asset_ids: getOptionalIds(options.referenceImageAssetIds),
      reference_video_asset_ids: getOptionalIds(options.referenceVideoAssetIds),
      start_image_asset_id: options.startImageAssetId,
      video_id: options.videoId,
      with_audio: options.withAudio,
    },
    method: 'POST',
    path: 'videos/generations',
    schema: videoGenerationResponseSchema,
  });
  guardVideoGenerationResponse(command, response);
  writeVideoGenerationResponse(command, response, options.json);
}

async function getVideoGenerationOptions(arguments_: string[]): Promise<VideoGenerationOptions> {
  const input = getVideoGenerationInput(arguments_);
  const prompt = await getPrompt(input.prompt, input.promptFile);
  return validateVideoGenerationInput(input, prompt);
}

function getVideoGenerationInput(arguments_: string[]): VideoGenerationInput {
  const input: VideoGenerationInput = {
    aspectRatio: '9:16',
    durationSec: undefined,
    endImageAssetId: undefined,
    json: false, model: undefined, name: undefined,
    negativePrompt: undefined,
    prompt: undefined, promptFile: undefined,
    referenceAudioAssetIds: [],
    referenceImageAssetIds: [],
    referenceVideoAssetIds: [],
    startImageAssetId: undefined, videoId: undefined,
    withAudio: true,
  };
  const seen = new Set<string>();

  for (let index = 0; index < arguments_.length; index += 1) {
    index = readVideoGenerationArgument({ arguments_, index, input, seen });
  }

  return input;
}

function readVideoGenerationArgument(values: VideoGenerationArgument): number {
  const argument = values.arguments_[values.index];
  if (argument === '--json' && !values.input.json) {
    values.input.json = true;
    return values.index;
  }
  const referenceIds = getGenerationReferenceIds(values.input, argument);
  if (referenceIds) {
    referenceIds.push(getOptionValue(values.arguments_, values.index, String(argument)));
    return values.index + 1;
  }
  if (argument === '--with-audio' || argument === '--no-audio') {
    guardNewOption(values.seen, 'audio', argument);
    values.input.withAudio = argument === '--with-audio';
    return values.index;
  }
  return readVideoGenerationValue(values);
}

function getGenerationReferenceIds(input: VideoGenerationInput, argument: string | undefined): string[] | null {
  if (argument === '--reference-image-asset-id') {
    return input.referenceImageAssetIds;
  }
  if (argument === '--reference-video-asset-id') {
    return input.referenceVideoAssetIds;
  }
  if (argument === '--reference-audio-asset-id') {
    return input.referenceAudioAssetIds;
  }
  return null;
}

function readVideoGenerationValue(values: VideoGenerationArgument): number {
  const argument = values.arguments_[values.index];
  const property = getGenerationProperty(argument);
  if (!property) {
    throw new CommandUsageError(`Unknown, repeated, or conflicting videos option: ${String(argument)}`);
  }
  const option = String(argument);
  guardNewOption(values.seen, property, option);
  values.input[property] = getOptionValue(values.arguments_, values.index, option);
  return values.index + 1;
}

function getGenerationProperty(argument: string | undefined): keyof Pick<
  VideoGenerationInput,
  | 'aspectRatio'
  | 'durationSec'
  | 'endImageAssetId'
  | 'model'
  | 'name'
  | 'negativePrompt'
  | 'prompt'
  | 'promptFile'
  | 'startImageAssetId'
  | 'videoId'
> | null {
  if (argument === '--aspect-ratio') {
    return 'aspectRatio';
  }
  if (argument === '--duration-sec') {
    return 'durationSec';
  }
  if (argument === '--end-image-asset-id') {
    return 'endImageAssetId';
  }
  if (argument === '--model') {
    return 'model';
  }
  if (argument === '--name') {
    return 'name';
  }
  if (argument === '--negative-prompt') {
    return 'negativePrompt';
  }
  if (argument === '--prompt') {
    return 'prompt';
  }
  if (argument === '--prompt-file') {
    return 'promptFile';
  }
  if (argument === '--start-image-asset-id') {
    return 'startImageAssetId';
  }
  if (argument === '--video-id') {
    return 'videoId';
  }
  return null;
}

function guardNewOption(seen: Set<string>, property: string, option: string): void {
  if (seen.has(property)) {
    throw new CommandUsageError(`Unknown, repeated, or conflicting videos option: ${option}`);
  }

  if ((property === 'prompt' && seen.has('promptFile')) || (property === 'promptFile' && seen.has('prompt'))) {
    throw new CommandUsageError(`Unknown, repeated, or conflicting videos option: ${option}`);
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

async function getPrompt(prompt: string | undefined, promptFile: string | undefined): Promise<string | undefined> {
  if (prompt !== undefined) {
    return prompt;
  }

  if (promptFile === undefined) {
    return undefined;
  }

  if (promptFile === '-') {
    return new Response(Bun.stdin.stream()).text();
  }

  return readFile(promptFile, 'utf8');
}

function validateVideoGenerationInput(
  input: VideoGenerationInput,
  promptInput: string | undefined,
): VideoGenerationOptions {
  if (input.videoId === undefined) {
    throw new CommandUsageError('Videos generate and estimate require --video-id.');
  }

  const name = videoNameSchema.safeParse(input.name);
  if (!name.success) {
    throw new CommandUsageError('Videos generate and estimate require --name with 1 to 120 characters.');
  }

  const prompt = videoPromptSchema.safeParse(promptInput);
  if (!prompt.success) {
    throw new CommandUsageError('Videos generate and estimate require --prompt or --prompt-file with at least 3 characters.');
  }

  const model = videoModelSchema.safeParse(input.model);
  if (!model.success) {
    throw new CommandUsageError(`Videos --model must be ${videoModelSchema.options.join(', ')}.`);
  }

  const durationSec = durationSecSchema.safeParse(Number(input.durationSec));
  if (!durationSec.success) {
    throw new CommandUsageError('Videos --duration-sec must be a number from 1 to 15.');
  }

  guardModelDuration(model.data, durationSec.data);
  const aspectRatio = aspectRatioSchema.safeParse(input.aspectRatio);
  if (!aspectRatio.success) {
    throw new CommandUsageError('Videos --aspect-ratio must be 1:1, 9:16, or 16:9.');
  }

  guardReferenceCount(input.referenceImageAssetIds, 9, '--reference-image-asset-id');
  guardReferenceCount(input.referenceVideoAssetIds, 3, '--reference-video-asset-id');
  guardReferenceCount(input.referenceAudioAssetIds, 3, '--reference-audio-asset-id');

  return {
    aspectRatio: aspectRatio.data,
    durationSec: durationSec.data,
    endImageAssetId: input.endImageAssetId,
    json: input.json,
    model: model.data,
    name: name.data,
    negativePrompt: input.negativePrompt,
    prompt: prompt.data,
    referenceAudioAssetIds: input.referenceAudioAssetIds,
    referenceImageAssetIds: input.referenceImageAssetIds,
    referenceVideoAssetIds: input.referenceVideoAssetIds,
    startImageAssetId: input.startImageAssetId,
    videoId: input.videoId,
    withAudio: input.withAudio,
  };
}

function guardModelDuration(model: z.infer<typeof videoModelSchema>, durationSec: number): void {
  if (model === 'V-STANDARD') {
    guardDurationRange({ durationSec, maximum: 15, minimum: 1, model });
    return;
  }

  if (model === 'V-LITE') {
    if (![4, 6, 8].includes(durationSec)) {
      throw new CommandUsageError('V-LITE --duration-sec must be 4, 6, or 8.');
    }
    return;
  }

  if (model === 'V-UGC') {
    if (![4, 6, 8, 10].includes(durationSec)) {
      throw new CommandUsageError('V-UGC --duration-sec must be 4, 6, 8, or 10.');
    }
    return;
  }

  if (model === 'V-ULTRA') {
    guardDurationRange({ durationSec, maximum: 15, minimum: 4, model });
    return;
  }

  guardDurationRange({ durationSec, maximum: 15, minimum: 3, model });
}

function guardDurationRange(options: {
  durationSec: number;
  maximum: number;
  minimum: number;
  model: string;
}): void {
  if (options.durationSec < options.minimum || options.durationSec > options.maximum) {
    throw new CommandUsageError(
      `${options.model} --duration-sec must be from ${String(options.minimum)} to ${String(options.maximum)}.`,
    );
  }
}

function guardReferenceCount(values: string[], maximum: number, option: string): void {
  if (values.length > maximum) {
    throw new CommandUsageError(`Videos accept at most ${String(maximum)} ${option} values.`);
  }
}

function getOptionalIds(values: string[]): string[] | undefined {
  if (values.length === 0) {
    return undefined;
  }

  return values;
}

function guardVideoGenerationResponse(
  command: 'estimate' | 'generate',
  response: z.infer<typeof videoGenerationResponseSchema>,
): void {
  if (command === 'estimate' && (response.status !== 'estimate' || response.credits === undefined)) {
    throw new Error('Viewpress returned an invalid estimate response.');
  }

  if (command === 'generate' && (response.status !== 'pending' || response.assetId === undefined)) {
    throw new Error('Viewpress returned an invalid video generation response.');
  }
}

function writeVideoGenerationResponse(
  command: 'estimate' | 'generate',
  response: z.infer<typeof videoGenerationResponseSchema>,
  json: boolean,
): void {
  if (json) {
    writeJson(response);
    return;
  }

  if (command === 'estimate') {
    process.stdout.write(`Estimated cost: ${String(response.credits)} credits.\n`);
    return;
  }

  process.stdout.write(`Started video asset ${String(response.assetId)} (${response.status}).\n`);
}

function showVideoGenerationHelp(command: 'estimate' | 'generate'): void {
  process.stdout.write(`Usage: viewpress videos ${command} --video-id <id> --name <name> (--prompt <text> | --prompt-file <path|->) --model <model> --duration-sec <seconds> [options]\n\nOptions:\n  --aspect-ratio <1:1|9:16|16:9>       Default: 9:16\n  --with-audio | --no-audio            Default: --with-audio\n  --start-image-asset-id <id>\n  --end-image-asset-id <id>\n  --reference-image-asset-id <id>       Repeat up to 9 times\n  --reference-video-asset-id <id>       Repeat up to 3 times\n  --reference-audio-asset-id <id>       Repeat up to 3 times\n  --negative-prompt <text>\n  --json\n`);
}
