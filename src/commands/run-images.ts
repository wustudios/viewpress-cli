import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { getApiResponse } from '../api/get-api-response.ts';
import { getRuntimeOptions } from '../cli/runtime-options.ts';
import { writeJson } from '../output/write-json.ts';
import { writeError } from '../output/write-error.ts';
import { CommandUsageError } from './command-usage-error.ts';

const imageResponseSchema = z.object({
  assetId: z.string(),
  status: z.literal('pending'),
});
const imageNameSchema = z.string().min(1).max(120);
const imagePromptSchema = z.string().min(3);
const aspectRatioSchema = z.enum(['1:1', '9:16', '16:9', '4:5']);
const imageModelSchema = z.enum(['I-FAST', 'I-PRO', 'I-REALISTIC']);
const referenceAssetIdsSchema = z.array(z.string()).min(1).max(6);

interface ImageInput {
  aspectRatio: string;
  model: string;
  name: string | undefined;
  prompt: string | undefined;
  promptFile: string | undefined;
  referenceAssetIds: string[];
  videoId: string | undefined;
}

interface ImageOptions {
  aspectRatio: z.infer<typeof aspectRatioSchema>;
  model: z.infer<typeof imageModelSchema>;
  name: string;
  prompt: string;
  referenceAssetIds: string[];
  videoId: string;
}

interface ImageArgument {
  arguments_: string[];
  index: number;
  input: ImageInput;
  needsReferences: boolean;
  seen: Set<string>;
}

export async function runImages(arguments_: string[]): Promise<number> {
  try {
    const command = arguments_[0];

    if (command === 'generate') {
      if (arguments_.includes('--help')) {
        showImageCommandHelp(command);
        return 0;
      }
      await generateImage(arguments_.slice(1));
      return 0;
    }

    if (command === 'edit') {
      if (arguments_.includes('--help')) {
        showImageCommandHelp(command);
        return 0;
      }
      await editImage(arguments_.slice(1));
      return 0;
    }

    if (command === undefined || (command === '--help' && arguments_.length === 1)) {
      if (getRuntimeOptions().json) {
        throw new CommandUsageError('An images command is required with --json.');
      }
      showImagesHelp();
      return 0;
    }

    throw new CommandUsageError(`Unknown images command: ${command}`);
  } catch (error) {
    if (error instanceof CommandUsageError && error.commandPath === undefined) {
      return writeError(
        new CommandUsageError(error.message, getImagesCommandPath(arguments_[0])),
        'Images command failed.',
      );
    }
    return writeError(error, 'Images command failed.');
  }
}

function getImagesCommandPath(command: string | undefined): string {
  if (command === 'generate' || command === 'edit') {
    return `images ${command}`;
  }
  return 'images';
}

async function generateImage(arguments_: string[]): Promise<void> {
  const options = await getImageOptions(arguments_, false);
  const response = await getApiResponse({
    body: {
      aspect_ratio: options.aspectRatio,
      model: options.model,
      name: options.name,
      prompt: options.prompt,
      video_id: options.videoId,
    },
    method: 'POST',
    path: 'images/generations',
    schema: imageResponseSchema,
  });
  writeImageResponse(response);
}

async function editImage(arguments_: string[]): Promise<void> {
  const options = await getImageOptions(arguments_, true);
  const response = await getApiResponse({
    body: {
      aspect_ratio: options.aspectRatio,
      name: options.name,
      prompt: options.prompt,
      reference_asset_ids: options.referenceAssetIds,
      video_id: options.videoId,
    },
    method: 'POST',
    path: 'images/edits',
    schema: imageResponseSchema,
  });
  writeImageResponse(response);
}

async function getImageOptions(arguments_: string[], needsReferences: boolean): Promise<ImageOptions> {
  const input = getImageInput(arguments_, needsReferences);
  const prompt = await getPrompt(input.prompt, input.promptFile);
  return getValidatedImageOptions({ input, needsReferences, prompt });
}

function getImageInput(arguments_: string[], needsReferences: boolean): ImageInput {
  const input: ImageInput = {
    aspectRatio: '9:16', model: 'I-PRO', name: undefined, prompt: undefined,
    promptFile: undefined, referenceAssetIds: [], videoId: undefined,
  };
  const seen = new Set<string>();
  for (let index = 0; index < arguments_.length; index += 1) {
    index = readImageArgument({ arguments_, index, input, needsReferences, seen });
  }
  return input;
}

function readImageArgument(values: ImageArgument): number {
  const { arguments_, index, input, needsReferences, seen } = values;
  const argument = arguments_[index];
  if (argument === '--reference-asset-id' && needsReferences) {
    input.referenceAssetIds.push(getOptionValue(arguments_, index, argument));
    return index + 1;
  }
  const property = getImageProperty(argument, needsReferences);
  if (!property) {
    throwUnknownArgument(argument);
  }
  if (property === 'prompt' || property === 'promptFile') {
    guardPromptOption(seen, property, String(argument));
  } else {
    guardNewOption(seen, property, String(argument));
  }
  input[property] = getOptionValue(arguments_, index, String(argument));
  return index + 1;
}

function getImageProperty(argument: string | undefined, needsReferences: boolean): keyof Pick<
  ImageInput,
  'aspectRatio' | 'model' | 'name' | 'prompt' | 'promptFile' | 'videoId'
> | null {
  if (argument === '--video-id') {
    return 'videoId';
  }
  if (argument === '--name') {
    return 'name';
  }
  if (argument === '--prompt') {
    return 'prompt';
  }
  if (argument === '--prompt-file') {
    return 'promptFile';
  }
  if (argument === '--aspect-ratio') {
    return 'aspectRatio';
  }
  if (argument === '--model' && !needsReferences) {
    return 'model';
  }
  return null;
}

function guardNewOption(seen: Set<string>, property: string, option: string): void {
  if (seen.has(property)) {
    throw new CommandUsageError(`Flag ${option} cannot be repeated.`);
  }
  seen.add(property);
}

function guardPromptOption(seen: Set<string>, property: 'prompt' | 'promptFile', option: string): void {
  const conflictingProperty = property === 'prompt' ? 'promptFile' : 'prompt';
  if (seen.has(property)) {
    throw new CommandUsageError(`Flag ${option} cannot be repeated.`);
  }
  if (seen.has(conflictingProperty)) {
    throw new CommandUsageError('Specify only one of --prompt or --prompt-file.');
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

function getValidatedImageOptions(values: {
  input: ImageInput;
  needsReferences: boolean;
  prompt: string | undefined;
}): ImageOptions {
  const text = getValidatedImageText(values.input, values.prompt);
  const format = getValidatedImageFormat(values.input, values.needsReferences);
  return {
    aspectRatio: format.aspectRatio,
    model: format.model,
    name: text.name,
    prompt: text.prompt,
    referenceAssetIds: values.input.referenceAssetIds,
    videoId: text.videoId,
  };
}

function getValidatedImageText(input: ImageInput, promptInput: string | undefined): {
  name: string;
  prompt: string;
  videoId: string;
} {
  if (!input.videoId) {
    throw new CommandUsageError('Images commands require --video-id.');
  }
  const name = imageNameSchema.safeParse(input.name);
  if (!name.success) {
    throw new CommandUsageError('Images commands require --name with 1 to 120 characters.');
  }
  const prompt = imagePromptSchema.safeParse(promptInput);
  if (!prompt.success) {
    throw new CommandUsageError('Images commands require --prompt or --prompt-file with at least 3 characters.');
  }
  return { name: name.data, prompt: prompt.data, videoId: input.videoId };
}

function getValidatedImageFormat(input: ImageInput, needsReferences: boolean): {
  aspectRatio: z.infer<typeof aspectRatioSchema>;
  model: z.infer<typeof imageModelSchema>;
} {
  const aspectRatio = aspectRatioSchema.safeParse(input.aspectRatio);
  if (!aspectRatio.success) {
    throw new CommandUsageError('Images --aspect-ratio must be 1:1, 9:16, 16:9, or 4:5.');
  }
  const model = imageModelSchema.safeParse(input.model);
  if (!model.success) {
    throw new CommandUsageError('Images --model must be I-FAST, I-PRO, or I-REALISTIC.');
  }
  const referenceAssetIds = referenceAssetIdsSchema.safeParse(input.referenceAssetIds);
  if (needsReferences && !referenceAssetIds.success) {
    throw new CommandUsageError('Images edit requires 1 to 6 --reference-asset-id values.');
  }
  return { aspectRatio: aspectRatio.data, model: model.data };
}

function writeImageResponse(response: z.infer<typeof imageResponseSchema>): void {
  if (getRuntimeOptions().json) {
    writeJson(response);
    return;
  }

  process.stdout.write(`Started image asset ${response.assetId} (${response.status}).\n`);
}

function showImagesHelp(): void {
  process.stdout.write(`Usage: viewpress images <command>\n\nCommands:\n  generate --video-id <id> --name <name> (--prompt <text> | --prompt-file <path|->) [--aspect-ratio <ratio>] [--model <model>] [--json]\n  edit --video-id <id> --name <name> (--prompt <text> | --prompt-file <path|->) --reference-asset-id <id>... [--aspect-ratio <ratio>] [--json]\n`);
}

function showImageCommandHelp(command: 'edit' | 'generate'): void {
  if (command === 'generate') {
    process.stdout.write('Usage: viewpress images generate --video-id <id> --name <name> (--prompt <text> | --prompt-file <path|->) [--aspect-ratio <ratio>] [--model <model>] [--json]\n');
    return;
  }

  process.stdout.write('Usage: viewpress images edit --video-id <id> --name <name> (--prompt <text> | --prompt-file <path|->) --reference-asset-id <id>... [--aspect-ratio <ratio>] [--json]\n');
}
