import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { getApiResponse } from '../api/get-api-response.ts';
import { getRuntimeOptions } from '../cli/runtime-options.ts';
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

interface MotionTransferInput {
  characterOrientation: string;
  imageAssetId: string | undefined;
  keepOriginalSound: boolean;
  motionVideoAssetId: string | undefined;
  name: string | undefined;
  prompt: string | undefined;
  promptFile: string | undefined;
  videoId: string | undefined;
}

interface MotionTransferOptions {
  characterOrientation: 'image' | 'video';
  imageAssetId: string;
  keepOriginalSound: boolean;
  motionVideoAssetId: string;
  name: string;
  prompt: string | undefined;
  videoId: string;
}

interface MotionTransferArgument {
  arguments_: string[];
  index: number;
  input: MotionTransferInput;
  seen: Set<string>;
}

interface TalkingImageInput {
  aspectRatio: string;
  audioAssetId: string | undefined;
  caption: boolean;
  imageAssetId: string | undefined;
  name: string | undefined;
  resolution: string;
  talkingStyle: string;
  videoId: string | undefined;
}

interface TalkingImageOptions {
  aspectRatio: z.infer<typeof aspectRatioSchema>;
  audioAssetId: string;
  caption: boolean;
  imageAssetId: string;
  name: string;
  resolution: '1080p' | '360p' | '480p' | '540p' | '720p';
  talkingStyle: 'expressive' | 'stable';
  videoId: string;
}

interface TalkingImageArgument {
  arguments_: string[];
  index: number;
  input: TalkingImageInput;
  seen: Set<string>;
}

interface UgcAdInput {
  referenceImageAssetIds: string[];
  values: Map<string, string>;
}

interface UgcAdOptions {
  aspectRatio: '16:9' | '9:16';
  cameraNotes: string | undefined;
  dialogue: string;
  durationSec: 4 | 6 | 8 | 10;
  name: string;
  referenceImageAssetIds: string[];
  referenceVideoAssetId: string | undefined;
  sceneNotes: string | undefined;
  subjectDescription: string;
  videoId: string;
  voiceNotes: string | undefined;
}

interface UgcAdArgument {
  arguments_: string[];
  index: number;
  input: UgcAdInput;
}

interface TimelapseInput {
  values: Map<string, string>;
}

interface TimelapseOptions {
  aspectRatio: '16:9' | '9:16';
  name: string;
  settingNotes: string | undefined;
  startImageAssetId: string;
  stepDescription: string;
  videoId: string;
  workerDescription: string | undefined;
}

interface TimelapseArgument {
  arguments_: string[];
  index: number;
  input: TimelapseInput;
}

export async function runVideoStyleTool(command: VideoStyleTool, arguments_: string[]): Promise<void> {
  if (arguments_.includes('--help')) {
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
  writePendingAssetResponse(response);
}

async function getMotionTransferOptions(arguments_: string[]): Promise<MotionTransferOptions> {
  const input = getMotionTransferInput(arguments_);
  const resolvedPrompt = await getPrompt(input.prompt, input.promptFile);
  const parsedPrompt = z.string().max(2500).optional().safeParse(resolvedPrompt);
  if (!parsedPrompt.success) {
    throw new CommandUsageError('Motion transfer --prompt must be at most 2500 characters.');
  }
  const parsedOrientation = z.enum(['image', 'video']).safeParse(input.characterOrientation);
  if (!parsedOrientation.success) {
    throw new CommandUsageError('Motion transfer --character-orientation must be image or video.');
  }
  return {
    characterOrientation: parsedOrientation.data,
    imageAssetId: getRequiredId(input.imageAssetId, 'Motion transfer requires --image-asset-id.'),
    keepOriginalSound: input.keepOriginalSound,
    motionVideoAssetId: getRequiredId(input.motionVideoAssetId, 'Motion transfer requires --motion-video-asset-id.'),
    name: getName(input.name, 'Motion transfer'),
    prompt: parsedPrompt.data,
    videoId: getRequiredId(input.videoId, 'Motion transfer requires --video-id.'),
  };
}

function getMotionTransferInput(arguments_: string[]): MotionTransferInput {
  const input: MotionTransferInput = {
    characterOrientation: 'video', imageAssetId: undefined, keepOriginalSound: true,
    motionVideoAssetId: undefined, name: undefined, prompt: undefined, promptFile: undefined, videoId: undefined,
  };
  const seen = new Set<string>();
  for (let index = 0; index < arguments_.length; index += 1) {
    index = readMotionTransferArgument({ arguments_, index, input, seen });
  }
  return input;
}

function readMotionTransferArgument(values: MotionTransferArgument): number {
  const argument = values.arguments_[values.index];
  if (argument === '--keep-original-sound' || argument === '--no-original-sound') {
    guardNewOption(values.seen, 'sound', argument);
    values.input.keepOriginalSound = argument === '--keep-original-sound';
    return values.index;
  }
  return readMotionTransferValue(values);
}

function readMotionTransferValue(values: MotionTransferArgument): number {
  const argument = values.arguments_[values.index];
  const property = getMotionTransferProperty(argument);
  if (!property) {
    throw unknownOption(argument);
  }
  if (property === 'prompt' || property === 'promptFile') {
    guardPromptOption(values.seen, property, String(argument));
  } else {
    guardNewOption(values.seen, property, String(argument));
  }
  values.input[property] = getOptionValue(values.arguments_, values.index, String(argument));
  return values.index + 1;
}

function getMotionTransferProperty(
  argument: string | undefined,
): keyof Omit<MotionTransferInput, 'keepOriginalSound'> | null {
  if (argument === '--character-orientation') {
    return 'characterOrientation';
  }
  if (argument === '--image-asset-id') {
    return 'imageAssetId';
  }
  if (argument === '--motion-video-asset-id') {
    return 'motionVideoAssetId';
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
  if (argument === '--video-id') {
    return 'videoId';
  }
  return null;
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
  writePendingAssetResponse(response);
}

function getTalkingImageOptions(arguments_: string[]): TalkingImageOptions {
  const input = getTalkingImageInput(arguments_);
  return {
    aspectRatio: getTalkingImageAspectRatio(input.aspectRatio),
    audioAssetId: getRequiredId(input.audioAssetId, 'Talking image requires --audio-asset-id.'),
    caption: input.caption,
    imageAssetId: getRequiredId(input.imageAssetId, 'Talking image requires --image-asset-id.'),
    name: getName(input.name, 'Talking image'),
    resolution: getTalkingImageResolution(input.resolution),
    talkingStyle: getTalkingImageStyle(input.talkingStyle),
    videoId: getRequiredId(input.videoId, 'Talking image requires --video-id.'),
  };
}

function getTalkingImageAspectRatio(value: string): z.infer<typeof aspectRatioSchema> {
  const aspectRatio = aspectRatioSchema.safeParse(value);
  if (!aspectRatio.success) {
    throw new CommandUsageError('Talking image --aspect-ratio must be 1:1, 9:16, or 16:9.');
  }
  return aspectRatio.data;
}

function getTalkingImageResolution(value: string): '1080p' | '360p' | '480p' | '540p' | '720p' {
  const resolution = z.enum(['360p', '480p', '540p', '720p', '1080p']).safeParse(value);
  if (!resolution.success) {
    throw new CommandUsageError('Talking image --resolution must be 360p, 480p, 540p, 720p, or 1080p.');
  }
  return resolution.data;
}

function getTalkingImageStyle(value: string): 'expressive' | 'stable' {
  const talkingStyle = z.enum(['stable', 'expressive']).safeParse(value);
  if (!talkingStyle.success) {
    throw new CommandUsageError('Talking image --talking-style must be stable or expressive.');
  }
  return talkingStyle.data;
}

function getTalkingImageInput(arguments_: string[]): TalkingImageInput {
  const input: TalkingImageInput = {
    aspectRatio: '9:16', audioAssetId: undefined, caption: false, imageAssetId: undefined,
    name: undefined, resolution: '720p', talkingStyle: 'stable', videoId: undefined,
  };
  const seen = new Set<string>();
  for (let index = 0; index < arguments_.length; index += 1) {
    index = readTalkingImageArgument({ arguments_, index, input, seen });
  }
  return input;
}

function readTalkingImageArgument(values: TalkingImageArgument): number {
  const argument = values.arguments_[values.index];
  if (argument === '--caption' || argument === '--no-caption') {
    guardNewOption(values.seen, 'caption', argument);
    values.input.caption = argument === '--caption';
    return values.index;
  }
  return readTalkingImageValue(values);
}

function readTalkingImageValue(values: TalkingImageArgument): number {
  const argument = values.arguments_[values.index];
  const property = getTalkingImageProperty(argument);
  if (!property) {
    throw unknownOption(argument);
  }
  guardNewOption(values.seen, property, String(argument));
  values.input[property] = getOptionValue(values.arguments_, values.index, String(argument));
  return values.index + 1;
}

function getTalkingImageProperty(
  argument: string | undefined,
): keyof Omit<TalkingImageInput, 'caption'> | null {
  if (argument === '--aspect-ratio') {
    return 'aspectRatio';
  }
  if (argument === '--audio-asset-id') {
    return 'audioAssetId';
  }
  if (argument === '--image-asset-id') {
    return 'imageAssetId';
  }
  if (argument === '--name') {
    return 'name';
  }
  if (argument === '--resolution') {
    return 'resolution';
  }
  if (argument === '--talking-style') {
    return 'talkingStyle';
  }
  if (argument === '--video-id') {
    return 'videoId';
  }
  return null;
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
  writePendingAssetResponse(response);
}

function getUgcAdOptions(arguments_: string[]): UgcAdOptions {
  const input = getUgcAdInput(arguments_);
  const subjectDescription = getUgcSubjectDescription(input.values);
  const dialogue = getUgcDialogue(input.values);
  const durationSec = getUgcDurationSec(input.values);
  const aspectRatio = getUgcAspectRatio(input.values);
  guardUgcReferenceCount(input);
  return {
    aspectRatio,
    cameraNotes: input.values.get('--camera-notes'),
    dialogue,
    durationSec,
    name: getName(input.values.get('--name'), 'UGC ad'),
    referenceImageAssetIds: input.referenceImageAssetIds,
    referenceVideoAssetId: input.values.get('--reference-video-asset-id'),
    sceneNotes: input.values.get('--scene-notes'),
    subjectDescription,
    videoId: getRequiredId(input.values.get('--video-id'), 'UGC ad requires --video-id.'),
    voiceNotes: input.values.get('--voice-notes'),
  };
}

function getUgcAdInput(arguments_: string[]): UgcAdInput {
  const input: UgcAdInput = { referenceImageAssetIds: [], values: new Map() };
  for (let index = 0; index < arguments_.length; index += 1) {
    index = readUgcAdArgument({ arguments_, index, input });
  }
  return input;
}

function readUgcAdArgument(values: UgcAdArgument): number {
  const argument = values.arguments_[values.index];
  if (argument === '--reference-image-asset-id') {
    values.input.referenceImageAssetIds.push(getOptionValue(values.arguments_, values.index, argument));
    return values.index + 1;
  }
  const option = String(argument);
  if (!ugcAdOptionNames.has(option) || values.input.values.has(option)) {
    throw unknownOption(argument);
  }
  values.input.values.set(option, getOptionValue(values.arguments_, values.index, option));
  return values.index + 1;
}

function getUgcSubjectDescription(values: Map<string, string>): string {
  const subjectDescription = z.string().min(10).safeParse(values.get('--subject-description'));
  if (!subjectDescription.success) {
    throw new CommandUsageError('UGC ad requires --subject-description with at least 10 characters.');
  }
  return subjectDescription.data;
}

function getUgcDialogue(values: Map<string, string>): string {
  const dialogue = z.string().min(2).max(400).safeParse(values.get('--dialogue'));
  if (!dialogue.success) {
    throw new CommandUsageError('UGC ad requires --dialogue with 2 to 400 characters.');
  }
  return dialogue.data;
}

function getUgcDurationSec(values: Map<string, string>): 4 | 6 | 8 | 10 {
  const durationSec = z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10)]).safeParse(
    Number(values.get('--duration-sec')),
  );
  if (!durationSec.success) {
    throw new CommandUsageError('UGC ad --duration-sec must be 4, 6, 8, or 10.');
  }
  return durationSec.data;
}

function getUgcAspectRatio(values: Map<string, string>): '16:9' | '9:16' {
  const aspectRatio = z.enum(['9:16', '16:9']).safeParse(values.get('--aspect-ratio') ?? '9:16');
  if (!aspectRatio.success) {
    throw new CommandUsageError('UGC ad --aspect-ratio must be 9:16 or 16:9.');
  }
  return aspectRatio.data;
}

function guardUgcReferenceCount(input: UgcAdInput): void {
  const referenceCap = input.values.has('--reference-video-asset-id') ? 5 : 7;
  if (input.referenceImageAssetIds.length < 1 || input.referenceImageAssetIds.length > referenceCap) {
    throw new CommandUsageError(`UGC ad requires 1 to ${String(referenceCap)} --reference-image-asset-id values.`);
  }
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

  if (getRuntimeOptions().json) {
    writeJson(response);
    return;
  }
  process.stdout.write(`Started video asset ${response.assetId} (${response.status}).\nEnd frame asset: ${response.endFrameAssetId}\n`);
}

function getTimelapseOptions(arguments_: string[]): TimelapseOptions {
  const input = getTimelapseInput(arguments_);
  return {
    aspectRatio: getTimelapseAspectRatio(input.values),
    name: getName(input.values.get('--name'), 'Timelapse scene'),
    settingNotes: input.values.get('--setting-notes'),
    startImageAssetId: getRequiredId(
      input.values.get('--start-image-asset-id'),
      'Timelapse scene requires --start-image-asset-id.',
    ),
    stepDescription: getTimelapseStepDescription(input.values),
    videoId: getRequiredId(input.values.get('--video-id'), 'Timelapse scene requires --video-id.'),
    workerDescription: input.values.get('--worker-description'),
  };
}

function getTimelapseInput(arguments_: string[]): TimelapseInput {
  const input: TimelapseInput = { values: new Map<string, string>() };
  for (let index = 0; index < arguments_.length; index += 1) {
    index = readTimelapseArgument({ arguments_, index, input });
  }
  return input;
}

function readTimelapseArgument(values: TimelapseArgument): number {
  const { arguments_, index, input } = values;
  const argument = arguments_[index];
  if (!timelapseOptionNames.has(String(argument)) || input.values.has(String(argument))) {
    throw unknownOption(argument);
  }
  input.values.set(String(argument), getOptionValue(arguments_, index, String(argument)));
  return index + 1;
}

function getTimelapseStepDescription(values: Map<string, string>): string {
  const stepDescription = z.string().min(10).safeParse(values.get('--step-description'));
  if (!stepDescription.success) {
    throw new CommandUsageError('Timelapse scene requires --step-description with at least 10 characters.');
  }
  return stepDescription.data;
}

function getTimelapseAspectRatio(values: Map<string, string>): '16:9' | '9:16' {
  const aspectRatio = z.enum(['9:16', '16:9']).safeParse(values.get('--aspect-ratio') ?? '9:16');
  if (!aspectRatio.success) {
    throw new CommandUsageError('Timelapse scene --aspect-ratio must be 9:16 or 16:9.');
  }
  return aspectRatio.data;
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

function writePendingAssetResponse(response: z.infer<typeof pendingAssetResponseSchema>): void {
  if (getRuntimeOptions().json) {
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
