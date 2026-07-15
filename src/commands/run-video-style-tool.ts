import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { getApiResponse } from '../api/get-api-response.ts';
import { writeJson } from '../output/write-json.ts';
import { CommandUsageError } from './command-usage-error.ts';

const pendingAssetResponseSchema = z.object({
  assetId: z.string(),
  status: z.literal('pending'),
});
const timelapseResponseSchema = z.object({
  assetId: z.string(),
  endFrameAssetId: z.string(),
  status: z.literal('pending'),
});
const nameSchema = z.string().min(1).max(120);
const aspectRatioSchema = z.enum(['1:1', '9:16', '16:9']);

type VideoStyleTool = 'motion-transfer' | 'talking-image' | 'timelapse-scene' | 'ugc-ad';

export async function runVideoStyleTool(command: VideoStyleTool, arguments_: string[]): Promise<void> {
  if (arguments_.length === 1 && (arguments_[0] === '--help' || arguments_[0] === '-h')) {
    showStyleToolHelp(command);
    return;
  }

  if (command === 'motion-transfer') {
    await runMotionTransfer(arguments_);
    return;
  }

  if (command === 'talking-image') {
    await runTalkingImage(arguments_);
    return;
  }

  if (command === 'ugc-ad') {
    await runUgcAd(arguments_);
    return;
  }

  await runTimelapseScene(arguments_);
}

async function runMotionTransfer(arguments_: string[]): Promise<void> {
  const options = await getMotionTransferOptions(arguments_);
  const response = await getApiResponse({
    body: {
      character_orientation: options.characterOrientation,
      image_asset_id: options.imageAssetId,
      keep_original_sound: options.keepOriginalSound,
      motion_video_asset_id: options.motionVideoAssetId,
      name: options.name,
      prompt: options.prompt,
      video_id: options.videoId,
    },
    method: 'POST',
    path: 'videos/motion-transfers',
    schema: pendingAssetResponseSchema,
  });
  writePendingAssetResponse(response, options.json);
}

async function getMotionTransferOptions(arguments_: string[]): Promise<{
  characterOrientation: 'image' | 'video';
  imageAssetId: string;
  json: boolean;
  keepOriginalSound: boolean;
  motionVideoAssetId: string;
  name: string;
  prompt: string | undefined;
  videoId: string;
}> {
  let characterOrientation = 'video';
  let imageAssetId: string | undefined;
  let json = false;
  let keepOriginalSound = true;
  let motionVideoAssetId: string | undefined;
  let name: string | undefined;
  let prompt: string | undefined;
  let promptFile: string | undefined;
  let videoId: string | undefined;
  const seen = new Set<string>();

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === '--json' && !json) {
      json = true;
      continue;
    }

    if (argument === '--keep-original-sound' || argument === '--no-original-sound') {
      guardNewOption(seen, 'sound', argument);
      keepOriginalSound = argument === '--keep-original-sound';
      continue;
    }

    if (argument === '--video-id') {
      guardNewOption(seen, 'videoId', argument);
      videoId = getOptionValue(arguments_, index, argument);
    } else if (argument === '--name') {
      guardNewOption(seen, 'name', argument);
      name = getOptionValue(arguments_, index, argument);
    } else if (argument === '--image-asset-id') {
      guardNewOption(seen, 'imageAssetId', argument);
      imageAssetId = getOptionValue(arguments_, index, argument);
    } else if (argument === '--motion-video-asset-id') {
      guardNewOption(seen, 'motionVideoAssetId', argument);
      motionVideoAssetId = getOptionValue(arguments_, index, argument);
    } else if (argument === '--character-orientation') {
      guardNewOption(seen, 'characterOrientation', argument);
      characterOrientation = getOptionValue(arguments_, index, argument);
    } else if (argument === '--prompt') {
      guardPromptOption(seen, 'prompt', argument);
      prompt = getOptionValue(arguments_, index, argument);
    } else if (argument === '--prompt-file') {
      guardPromptOption(seen, 'promptFile', argument);
      promptFile = getOptionValue(arguments_, index, argument);
    } else {
      throw unknownOption(argument);
    }
    index += 1;
  }

  const resolvedPrompt = await getPrompt(prompt, promptFile);
  const parsedPrompt = z.string().max(2500).optional().safeParse(resolvedPrompt);
  if (!parsedPrompt.success) {
    throw new CommandUsageError('Motion transfer --prompt must be at most 2500 characters.');
  }
  const parsedOrientation = z.enum(['image', 'video']).safeParse(characterOrientation);
  if (!parsedOrientation.success) {
    throw new CommandUsageError('Motion transfer --character-orientation must be image or video.');
  }

  return {
    characterOrientation: parsedOrientation.data,
    imageAssetId: getRequiredId(imageAssetId, 'Motion transfer requires --image-asset-id.'),
    json,
    keepOriginalSound,
    motionVideoAssetId: getRequiredId(motionVideoAssetId, 'Motion transfer requires --motion-video-asset-id.'),
    name: getName(name, 'Motion transfer'),
    prompt: parsedPrompt.data,
    videoId: getRequiredId(videoId, 'Motion transfer requires --video-id.'),
  };
}

async function runTalkingImage(arguments_: string[]): Promise<void> {
  const options = getTalkingImageOptions(arguments_);
  const response = await getApiResponse({
    body: {
      aspect_ratio: options.aspectRatio,
      audio_asset_id: options.audioAssetId,
      caption: options.caption,
      image_asset_id: options.imageAssetId,
      name: options.name,
      resolution: options.resolution,
      talking_style: options.talkingStyle,
      video_id: options.videoId,
    },
    method: 'POST',
    path: 'videos/talking-images',
    schema: pendingAssetResponseSchema,
  });
  writePendingAssetResponse(response, options.json);
}

function getTalkingImageOptions(arguments_: string[]): {
  aspectRatio: z.infer<typeof aspectRatioSchema>;
  audioAssetId: string;
  caption: boolean;
  imageAssetId: string;
  json: boolean;
  name: string;
  resolution: '1080p' | '360p' | '480p' | '540p' | '720p';
  talkingStyle: 'expressive' | 'stable';
  videoId: string;
} {
  let aspectRatio = '9:16';
  let audioAssetId: string | undefined;
  let caption = false;
  let imageAssetId: string | undefined;
  let json = false;
  let name: string | undefined;
  let resolution = '720p';
  let talkingStyle = 'stable';
  let videoId: string | undefined;
  const seen = new Set<string>();

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--json' && !json) {
      json = true;
      continue;
    }
    if (argument === '--caption' || argument === '--no-caption') {
      guardNewOption(seen, 'caption', argument);
      caption = argument === '--caption';
      continue;
    }
    if (argument === '--video-id') {
      guardNewOption(seen, 'videoId', argument);
      videoId = getOptionValue(arguments_, index, argument);
    } else if (argument === '--name') {
      guardNewOption(seen, 'name', argument);
      name = getOptionValue(arguments_, index, argument);
    } else if (argument === '--image-asset-id') {
      guardNewOption(seen, 'imageAssetId', argument);
      imageAssetId = getOptionValue(arguments_, index, argument);
    } else if (argument === '--audio-asset-id') {
      guardNewOption(seen, 'audioAssetId', argument);
      audioAssetId = getOptionValue(arguments_, index, argument);
    } else if (argument === '--aspect-ratio') {
      guardNewOption(seen, 'aspectRatio', argument);
      aspectRatio = getOptionValue(arguments_, index, argument);
    } else if (argument === '--resolution') {
      guardNewOption(seen, 'resolution', argument);
      resolution = getOptionValue(arguments_, index, argument);
    } else if (argument === '--talking-style') {
      guardNewOption(seen, 'talkingStyle', argument);
      talkingStyle = getOptionValue(arguments_, index, argument);
    } else {
      throw unknownOption(argument);
    }
    index += 1;
  }

  const parsedAspectRatio = aspectRatioSchema.safeParse(aspectRatio);
  if (!parsedAspectRatio.success) {
    throw new CommandUsageError('Talking image --aspect-ratio must be 1:1, 9:16, or 16:9.');
  }
  const parsedResolution = z.enum(['360p', '480p', '540p', '720p', '1080p']).safeParse(resolution);
  if (!parsedResolution.success) {
    throw new CommandUsageError('Talking image --resolution must be 360p, 480p, 540p, 720p, or 1080p.');
  }
  const parsedTalkingStyle = z.enum(['stable', 'expressive']).safeParse(talkingStyle);
  if (!parsedTalkingStyle.success) {
    throw new CommandUsageError('Talking image --talking-style must be stable or expressive.');
  }

  return {
    aspectRatio: parsedAspectRatio.data,
    audioAssetId: getRequiredId(audioAssetId, 'Talking image requires --audio-asset-id.'),
    caption,
    imageAssetId: getRequiredId(imageAssetId, 'Talking image requires --image-asset-id.'),
    json,
    name: getName(name, 'Talking image'),
    resolution: parsedResolution.data,
    talkingStyle: parsedTalkingStyle.data,
    videoId: getRequiredId(videoId, 'Talking image requires --video-id.'),
  };
}

async function runUgcAd(arguments_: string[]): Promise<void> {
  const options = getUgcAdOptions(arguments_);
  const response = await getApiResponse({
    body: {
      aspect_ratio: options.aspectRatio,
      camera_notes: options.cameraNotes,
      dialogue: options.dialogue,
      duration_sec: options.durationSec,
      name: options.name,
      reference_image_asset_ids: options.referenceImageAssetIds,
      reference_video_asset_id: options.referenceVideoAssetId,
      scene_notes: options.sceneNotes,
      subject_description: options.subjectDescription,
      video_id: options.videoId,
      voice_notes: options.voiceNotes,
    },
    method: 'POST',
    path: 'videos/ugc-ads',
    schema: pendingAssetResponseSchema,
  });
  writePendingAssetResponse(response, options.json);
}

function getUgcAdOptions(arguments_: string[]): {
  aspectRatio: '16:9' | '9:16';
  cameraNotes: string | undefined;
  dialogue: string;
  durationSec: 4 | 6 | 8 | 10;
  json: boolean;
  name: string;
  referenceImageAssetIds: string[];
  referenceVideoAssetId: string | undefined;
  sceneNotes: string | undefined;
  subjectDescription: string;
  videoId: string;
  voiceNotes: string | undefined;
} {
  const values = new Map<string, string>();
  const referenceImageAssetIds: string[] = [];
  let json = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--json' && !json) {
      json = true;
      continue;
    }
    if (argument === '--reference-image-asset-id') {
      referenceImageAssetIds.push(getOptionValue(arguments_, index, argument));
      index += 1;
      continue;
    }
    if (!ugcAdOptionNames.has(String(argument)) || values.has(String(argument))) {
      throw unknownOption(argument);
    }
    values.set(String(argument), getOptionValue(arguments_, index, String(argument)));
    index += 1;
  }

  const subjectDescription = z.string().min(10).safeParse(values.get('--subject-description'));
  if (!subjectDescription.success) {
    throw new CommandUsageError('UGC ad requires --subject-description with at least 10 characters.');
  }
  const dialogue = z.string().min(2).max(400).safeParse(values.get('--dialogue'));
  if (!dialogue.success) {
    throw new CommandUsageError('UGC ad requires --dialogue with 2 to 400 characters.');
  }
  const durationSec = z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10)]).safeParse(
    Number(values.get('--duration-sec')),
  );
  if (!durationSec.success) {
    throw new CommandUsageError('UGC ad --duration-sec must be 4, 6, 8, or 10.');
  }
  const aspectRatio = z.enum(['9:16', '16:9']).safeParse(values.get('--aspect-ratio') ?? '9:16');
  if (!aspectRatio.success) {
    throw new CommandUsageError('UGC ad --aspect-ratio must be 9:16 or 16:9.');
  }
  const referenceCap = values.has('--reference-video-asset-id') ? 5 : 7;
  if (referenceImageAssetIds.length < 1 || referenceImageAssetIds.length > referenceCap) {
    throw new CommandUsageError(`UGC ad requires 1 to ${String(referenceCap)} --reference-image-asset-id values.`);
  }

  return {
    aspectRatio: aspectRatio.data,
    cameraNotes: values.get('--camera-notes'),
    dialogue: dialogue.data,
    durationSec: durationSec.data,
    json,
    name: getName(values.get('--name'), 'UGC ad'),
    referenceImageAssetIds,
    referenceVideoAssetId: values.get('--reference-video-asset-id'),
    sceneNotes: values.get('--scene-notes'),
    subjectDescription: subjectDescription.data,
    videoId: getRequiredId(values.get('--video-id'), 'UGC ad requires --video-id.'),
    voiceNotes: values.get('--voice-notes'),
  };
}

const ugcAdOptionNames = new Set([
  '--aspect-ratio',
  '--camera-notes',
  '--dialogue',
  '--duration-sec',
  '--name',
  '--reference-video-asset-id',
  '--scene-notes',
  '--subject-description',
  '--video-id',
  '--voice-notes',
]);

async function runTimelapseScene(arguments_: string[]): Promise<void> {
  const options = getTimelapseOptions(arguments_);
  const response = await getApiResponse({
    body: {
      aspect_ratio: options.aspectRatio,
      name: options.name,
      setting_notes: options.settingNotes,
      start_image_asset_id: options.startImageAssetId,
      step_description: options.stepDescription,
      video_id: options.videoId,
      worker_description: options.workerDescription,
    },
    method: 'POST',
    path: 'videos/timelapse-scenes',
    schema: timelapseResponseSchema,
  });

  if (options.json) {
    writeJson(response);
    return;
  }
  process.stdout.write(`Started video asset ${response.assetId} (${response.status}).\nEnd frame asset: ${response.endFrameAssetId}\n`);
}

function getTimelapseOptions(arguments_: string[]): {
  aspectRatio: '16:9' | '9:16';
  json: boolean;
  name: string;
  settingNotes: string | undefined;
  startImageAssetId: string;
  stepDescription: string;
  videoId: string;
  workerDescription: string | undefined;
} {
  const values = new Map<string, string>();
  let json = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--json' && !json) {
      json = true;
      continue;
    }
    if (!timelapseOptionNames.has(String(argument)) || values.has(String(argument))) {
      throw unknownOption(argument);
    }
    values.set(String(argument), getOptionValue(arguments_, index, String(argument)));
    index += 1;
  }

  const stepDescription = z.string().min(10).safeParse(values.get('--step-description'));
  if (!stepDescription.success) {
    throw new CommandUsageError('Timelapse scene requires --step-description with at least 10 characters.');
  }
  const aspectRatio = z.enum(['9:16', '16:9']).safeParse(values.get('--aspect-ratio') ?? '9:16');
  if (!aspectRatio.success) {
    throw new CommandUsageError('Timelapse scene --aspect-ratio must be 9:16 or 16:9.');
  }

  return {
    aspectRatio: aspectRatio.data,
    json,
    name: getName(values.get('--name'), 'Timelapse scene'),
    settingNotes: values.get('--setting-notes'),
    startImageAssetId: getRequiredId(
      values.get('--start-image-asset-id'),
      'Timelapse scene requires --start-image-asset-id.',
    ),
    stepDescription: stepDescription.data,
    videoId: getRequiredId(values.get('--video-id'), 'Timelapse scene requires --video-id.'),
    workerDescription: values.get('--worker-description'),
  };
}

const timelapseOptionNames = new Set([
  '--aspect-ratio',
  '--name',
  '--setting-notes',
  '--start-image-asset-id',
  '--step-description',
  '--video-id',
  '--worker-description',
]);

function getOptionValue(arguments_: string[], index: number, optionName: string): string {
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new CommandUsageError(`${optionName} requires a value.`);
  }
  return value;
}

function guardNewOption(seen: Set<string>, property: string, option: string): void {
  if (seen.has(property)) {
    throw unknownOption(option);
  }
  seen.add(property);
}

function guardPromptOption(seen: Set<string>, property: 'prompt' | 'promptFile', option: string): void {
  const conflictingProperty = property === 'prompt' ? 'promptFile' : 'prompt';
  if (seen.has(property) || seen.has(conflictingProperty)) {
    throw unknownOption(option);
  }
  seen.add(property);
}

function unknownOption(argument: string | undefined): CommandUsageError {
  return new CommandUsageError(`Unknown, repeated, or conflicting videos option: ${String(argument)}`);
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

function getName(nameInput: string | undefined, commandName: string): string {
  const name = nameSchema.safeParse(nameInput);
  if (!name.success) {
    throw new CommandUsageError(`${commandName} requires --name with 1 to 120 characters.`);
  }
  return name.data;
}

function getRequiredId(value: string | undefined, message: string): string {
  if (value === undefined) {
    throw new CommandUsageError(message);
  }
  return value;
}

function writePendingAssetResponse(response: z.infer<typeof pendingAssetResponseSchema>, json: boolean): void {
  if (json) {
    writeJson(response);
    return;
  }
  process.stdout.write(`Started video asset ${response.assetId} (${response.status}).\n`);
}

function showStyleToolHelp(command: VideoStyleTool): void {
  if (command === 'motion-transfer') {
    process.stdout.write('Usage: viewpress videos motion-transfer --video-id <id> --name <name> --image-asset-id <id> --motion-video-asset-id <id> [--character-orientation <image|video>] [--prompt <text> | --prompt-file <path|->] [--keep-original-sound | --no-original-sound] [--json]\n\nDefaults: --character-orientation video, --keep-original-sound\n');
    return;
  }
  if (command === 'talking-image') {
    process.stdout.write('Usage: viewpress videos talking-image --video-id <id> --name <name> --image-asset-id <id> --audio-asset-id <id> [--aspect-ratio <ratio>] [--resolution <resolution>] [--caption | --no-caption] [--talking-style <style>] [--json]\n\nDefaults: --aspect-ratio 9:16, --resolution 720p, --no-caption, --talking-style stable\n');
    return;
  }
  if (command === 'ugc-ad') {
    process.stdout.write('Usage: viewpress videos ugc-ad --video-id <id> --name <name> --subject-description <text> --dialogue <text> --reference-image-asset-id <id>... --duration-sec <4|6|8|10> [--reference-video-asset-id <id>] [--scene-notes <text>] [--voice-notes <text>] [--camera-notes <text>] [--aspect-ratio <9:16|16:9>] [--json]\n\nDefault: --aspect-ratio 9:16\n');
    return;
  }
  process.stdout.write('Usage: viewpress videos timelapse-scene --video-id <id> --name <name> --step-description <text> --start-image-asset-id <id> [--worker-description <text>] [--setting-notes <text>] [--aspect-ratio <9:16|16:9>] [--json]\n\nDefault: --aspect-ratio 9:16\n');
}
