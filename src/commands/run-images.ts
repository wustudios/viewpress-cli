import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { getApiResponse } from '../api/get-api-response.ts';
import { writeJson } from '../output/write-json.ts';
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

export async function runImages(arguments_: string[]): Promise<number> {
  try {
    const command = arguments_[0];

    if (command === 'generate') {
      await generateImage(arguments_.slice(1));
      return 0;
    }

    if (command === 'edit') {
      await editImage(arguments_.slice(1));
      return 0;
    }

    if (command === undefined || ((command === '--help' || command === '-h') && arguments_.length === 1)) {
      showImagesHelp();
      return 0;
    }

    throw new CommandUsageError(`Unknown images command: ${command}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Images command failed.';
    process.stderr.write(`Error: ${message}\n`);
    return error instanceof CommandUsageError ? 2 : 1;
  }
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
  writeImageResponse(response, options.json);
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
  writeImageResponse(response, options.json);
}

async function getImageOptions(arguments_: string[], needsReferences: boolean): Promise<{
  aspectRatio: z.infer<typeof aspectRatioSchema>;
  json: boolean;
  model: z.infer<typeof imageModelSchema>;
  name: string;
  prompt: string;
  referenceAssetIds: string[];
  videoId: string;
}> {
  let aspectRatio = '9:16';
  let hasAspectRatio = false;
  let json = false;
  let hasModel = false;
  let model = 'I-PRO';
  let name: string | undefined;
  let prompt: string | undefined;
  let promptFile: string | undefined;
  const referenceAssetIds: string[] = [];
  let videoId: string | undefined;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === '--json' && !json) {
      json = true;
      continue;
    }

    if (argument === '--reference-asset-id' && needsReferences) {
      referenceAssetIds.push(getOptionValue(arguments_, index, argument));
      index += 1;
      continue;
    }

    if (argument === '--video-id' && videoId === undefined) {
      videoId = getOptionValue(arguments_, index, argument);
      index += 1;
      continue;
    }

    if (argument === '--name' && name === undefined) {
      name = getOptionValue(arguments_, index, argument);
      index += 1;
      continue;
    }

    if (argument === '--prompt' && prompt === undefined && promptFile === undefined) {
      prompt = getOptionValue(arguments_, index, argument);
      index += 1;
      continue;
    }

    if (argument === '--prompt-file' && promptFile === undefined && prompt === undefined) {
      promptFile = getOptionValue(arguments_, index, argument);
      index += 1;
      continue;
    }

    if (argument === '--aspect-ratio' && !hasAspectRatio) {
      aspectRatio = getOptionValue(arguments_, index, argument);
      hasAspectRatio = true;
      index += 1;
      continue;
    }

    if (argument === '--model' && !needsReferences && !hasModel) {
      model = getOptionValue(arguments_, index, argument);
      hasModel = true;
      index += 1;
      continue;
    }

    throw new CommandUsageError(`Unknown, repeated, or conflicting images option: ${String(argument)}`);
  }

  const resolvedPrompt = await getPrompt(prompt, promptFile);
  return getValidatedImageOptions({
    aspectRatio,
    json,
    model,
    name,
    needsReferences,
    prompt: resolvedPrompt,
    referenceAssetIds,
    videoId,
  });
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

function getValidatedImageOptions(options: {
  aspectRatio: string;
  json: boolean;
  model: string;
  name: string | undefined;
  needsReferences: boolean;
  prompt: string | undefined;
  referenceAssetIds: string[];
  videoId: string | undefined;
}): {
  aspectRatio: z.infer<typeof aspectRatioSchema>;
  json: boolean;
  model: z.infer<typeof imageModelSchema>;
  name: string;
  prompt: string;
  referenceAssetIds: string[];
  videoId: string;
} {
  if (!options.videoId) {
    throw new CommandUsageError('Images commands require --video-id.');
  }

  const name = imageNameSchema.safeParse(options.name);
  if (!name.success) {
    throw new CommandUsageError('Images commands require --name with 1 to 120 characters.');
  }

  const prompt = imagePromptSchema.safeParse(options.prompt);
  if (!prompt.success) {
    throw new CommandUsageError('Images commands require --prompt or --prompt-file with at least 3 characters.');
  }

  const aspectRatio = aspectRatioSchema.safeParse(options.aspectRatio);
  if (!aspectRatio.success) {
    throw new CommandUsageError('Images --aspect-ratio must be 1:1, 9:16, 16:9, or 4:5.');
  }

  const model = imageModelSchema.safeParse(options.model);
  if (!model.success) {
    throw new CommandUsageError('Images --model must be I-FAST, I-PRO, or I-REALISTIC.');
  }

  const referenceAssetIds = referenceAssetIdsSchema.safeParse(options.referenceAssetIds);
  if (options.needsReferences && !referenceAssetIds.success) {
    throw new CommandUsageError('Images edit requires 1 to 6 --reference-asset-id values.');
  }

  return {
    aspectRatio: aspectRatio.data,
    json: options.json,
    model: model.data,
    name: name.data,
    prompt: prompt.data,
    referenceAssetIds: options.referenceAssetIds,
    videoId: options.videoId,
  };
}

function writeImageResponse(response: z.infer<typeof imageResponseSchema>, json: boolean): void {
  if (json) {
    writeJson(response);
    return;
  }

  process.stdout.write(`Started image asset ${response.assetId} (${response.status}).\n`);
}

function showImagesHelp(): void {
  process.stdout.write(`Usage: viewpress images <command>\n\nCommands:\n  generate --video-id <id> --name <name> (--prompt <text> | --prompt-file <path|->) [--aspect-ratio <ratio>] [--model <model>] [--json]\n  edit --video-id <id> --name <name> (--prompt <text> | --prompt-file <path|->) --reference-asset-id <id>... [--aspect-ratio <ratio>] [--json]\n`);
}
