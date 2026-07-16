import { z } from 'zod';

import { getApiResponse } from '../api/get-api-response.ts';
import { CliError } from '../cli/cli-error.ts';
import { getRuntimeOptions } from '../cli/runtime-options.ts';
import { writeJson } from '../output/write-json.ts';
import { writeError } from '../output/write-error.ts';
import { CommandUsageError } from './command-usage-error.ts';
import { downloadAsset } from './download-asset.ts';

const assetKindSchema = z.enum(['image', 'video', 'audio', 'sfx', 'music', 'render']);
const assetSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  kind: z.string(),
  status: z.string(),
  url: z.string().optional(),
  previewUrl: z.string().optional(),
  mimeType: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  durationMs: z.number().optional(),
  progress: z.number().optional(),
  error: z.string().optional(),
  createdAt: z.number(),
});
const assetsResponseSchema = z.object({ assets: z.array(assetSchema) });
const transformResponseSchema = z.object({ assetId: z.string(), status: z.literal('pending') });
const captionPresetSchema = z.enum(['basic', 'plain_white', 'minima', 'viewpress', 'punch', 'wrap', 'outline']);
const textTransformSchema = z.enum(['uppercase', 'lowercase', 'none']);
const alignmentSchema = z.enum(['top', 'middle', 'bottom']);
const wordsAtATimeSchema = z.enum(['one', 'short', 'long']);
const outputCodecSchema = z.enum(['vp9', 'h264']);

interface CaptionInput {
  alignment: string;
  animated: boolean;
  color?: string;
  fontFamily?: string;
  fontSize: string;
  fontWeight?: string;
  karaoke: boolean;
  presetId: string;
  textTransform?: string;
  wordsAtATime: string;
}

interface CaptionArgument {
  arguments_: string[];
  index: number;
  input: CaptionInput;
  seen: Set<string>;
}

interface UpscaleInput {
  height?: string;
  outputFrameRate?: string;
  width?: string;
}

interface AssetListInput {
  kind: string | undefined;
  limit: string;
  videoId: string | undefined;
}

interface AssetListOptions {
  kind?: z.infer<typeof assetKindSchema>;
  limit: number;
  videoId: string;
}

interface AssetListArgument {
  arguments_: string[];
  index: number;
  input: AssetListInput;
  seen: Set<string>;
}

interface RemoveBackgroundInput {
  outputCodec: string;
  refineForegroundEdges: boolean;
  subjectIsPerson: boolean;
}

interface RemoveBackgroundArgument {
  arguments_: string[];
  index: number;
  input: RemoveBackgroundInput;
  seen: Set<string>;
}

interface EnhanceAudioInput {
  normalize: boolean;
  removeNoise: boolean;
  studioSound: boolean;
}

interface EnhanceAudioArgument {
  argument: string;
  input: EnhanceAudioInput;
  seen: Set<string>;
}

interface DownloadInput {
  force: boolean;
  output: string | undefined;
}

interface WaitInput {
  pollInterval: string;
  waitTimeout: string;
}

export async function runAssets(arguments_: string[]): Promise<number> {
  try {
    const command = arguments_[0];

    if (command === undefined || ((command === '--help' || command === '-h') && arguments_.length === 1)) {
      showAssetsHelp();
      return 0;
    }

    await runAssetCommand(command, arguments_.slice(1));
    return 0;
  } catch (error) {
    return writeError(error, 'Assets command failed.');
  }
}

async function runAssetCommand(command: string, arguments_: string[]): Promise<void> {
  if (arguments_.includes('--help')) {
    showAssetCommandHelp(command);
    return;
  }

  if (command === 'list') {
    await listAssets(arguments_);
    return;
  }
  if (command === 'get') {
    await getAssetCommand(arguments_);
    return;
  }
  if (command === 'wait') {
    await waitForAsset(arguments_);
    return;
  }
  if (command === 'download') {
    await downloadAssetCommand(arguments_);
    return;
  }
  if (command === 'add-captions') {
    await addCaptions(arguments_);
    return;
  }
  if (command === 'upscale') {
    await upscaleAsset(arguments_);
    return;
  }
  if (command === 'remove-background') {
    await removeBackground(arguments_);
    return;
  }
  if (command === 'enhance-audio') {
    await enhanceAudio(arguments_);
    return;
  }
  if (command === 'smooth' || command === 'humanize' || command === 'transcribe') {
    await runBodylessTransform(command, arguments_);
    return;
  }

  throw new CommandUsageError(`Unknown assets command: ${command}`);
}

async function listAssets(arguments_: string[]): Promise<void> {
  const options = getListOptions(arguments_);
  const query = new URLSearchParams({ limit: String(options.limit), video_id: options.videoId });
  if (options.kind) {
    query.set('kind', options.kind);
  }
  const response = await getApiResponse({ method: 'GET', path: 'assets', query, schema: assetsResponseSchema });

  if (getRuntimeOptions().json) {
    writeJson(response);
    return;
  }
  if (response.assets.length === 0) {
    process.stdout.write('No assets.\n');
    return;
  }
  for (const asset of response.assets) {
    writeAssetLine(asset);
  }
}

function getListOptions(arguments_: string[]): AssetListOptions {
  const input = getAssetListInput(arguments_);
  if (!input.videoId) {
    throw new CommandUsageError('Assets list requires --video-id.');
  }
  const kind = getAssetKind(input.kind);
  return {
    ...(kind === undefined ? {} : { kind }),
    limit: getInteger(input.limit, '--limit', 1, 200),
    videoId: input.videoId,
  };
}

function getAssetListInput(arguments_: string[]): AssetListInput {
  const input: AssetListInput = { kind: undefined, limit: '50', videoId: undefined };
  const seen = new Set<string>();
  for (let index = 0; index < arguments_.length; index += 1) {
    index = readAssetListArgument({ arguments_, index, input, seen });
  }
  return input;
}

function readAssetListArgument(values: AssetListArgument): number {
  const { arguments_, index, input, seen } = values;
  const argument = arguments_[index];
  const property = getAssetListProperty(argument);
  if (!property) {
    throw new CommandUsageError(`Unknown or repeated assets list option: ${String(argument)}`);
  }
  guardNewOption(seen, property, argument);
  input[property] = getOptionValue(arguments_, index, String(argument));
  return index + 1;
}

function getAssetListProperty(argument: string | undefined): 'kind' | 'limit' | 'videoId' | null {
  if (argument === '--video-id') {
    return 'videoId';
  }
  if (argument === '--kind') {
    return 'kind';
  }
  if (argument === '--limit') {
    return 'limit';
  }
  return null;
}

function getAssetKind(kind: string | undefined): z.infer<typeof assetKindSchema> | undefined {
  if (kind === undefined) {
    return undefined;
  }
  const parsedKind = assetKindSchema.safeParse(kind);
  if (!parsedKind.success) {
    throw new CommandUsageError('Assets --kind must be image, video, audio, sfx, music, or render.');
  }
  return parsedKind.data;
}

async function getAssetCommand(arguments_: string[]): Promise<void> {
  const assetId = getAssetId(arguments_, 'get');
  guardNoExtraOptions(arguments_, 'get');
  const asset = await getAsset(assetId);
  writeAsset(asset);
}

async function waitForAsset(arguments_: string[]): Promise<void> {
  const options = getWaitOptions(arguments_);
  const deadline = Date.now() + options.waitTimeoutSec * 1000;

  while (Date.now() <= deadline) {
    const asset = await getAssetBeforeDeadline({
      assetId: options.assetId, deadline, waitTimeoutSec: options.waitTimeoutSec,
    });
    if (asset.status === 'ready') {
      writeAsset(asset);
      return;
    }
    guardAssetActive(asset);
    writeWaitNotice(asset);
    await sleepBeforeNextPoll({
      assetId: asset.id, deadline, pollIntervalSec: options.pollIntervalSec, waitTimeoutSec: options.waitTimeoutSec,
    });
  }

  throwWaitTimeout(options.assetId, options.waitTimeoutSec);
}

async function getAssetBeforeDeadline(
  arguments_: { assetId: string; deadline: number; waitTimeoutSec: number },
): Promise<z.infer<typeof assetSchema>> {
  const remainingMs = arguments_.deadline - Date.now();
  if (remainingMs <= 0) {
    throwWaitTimeout(arguments_.assetId, arguments_.waitTimeoutSec);
  }
  try {
    const asset = await getAsset(arguments_.assetId, remainingMs);
    if (Date.now() >= arguments_.deadline) {
      throwWaitTimeout(arguments_.assetId, arguments_.waitTimeoutSec);
    }
    return asset;
  } catch (error) {
    if (Date.now() >= arguments_.deadline) {
      throwWaitTimeout(arguments_.assetId, arguments_.waitTimeoutSec);
    }
    throw error;
  }
}

function guardAssetActive(asset: z.infer<typeof assetSchema>): void {
  if (asset.status === 'error' || asset.status === 'validation_error' || asset.status === 'canceled') {
    throw new CliError({
      exitCode: 1,
      message: `Asset ${asset.id} ended with status ${asset.status}${asset.error ? `: ${asset.error}` : '.'}`,
      type: 'terminal_error',
    });
  }
}

async function sleepBeforeNextPoll(values: {
  assetId: string;
  deadline: number;
  pollIntervalSec: number;
  waitTimeoutSec: number;
}): Promise<void> {
  const remainingMs = values.deadline - Date.now();
  if (remainingMs <= 0) {
    throwWaitTimeout(values.assetId, values.waitTimeoutSec);
  }
  await Bun.sleep(Math.min(values.pollIntervalSec * 1000, remainingMs));
}

function getWaitOptions(arguments_: string[]): {
  assetId: string;
  pollIntervalSec: number;
  waitTimeoutSec: number;
} {
  const assetId = getAssetId(arguments_, 'wait');
  const input = getWaitInput(arguments_.slice(1));
  return {
    assetId,
    pollIntervalSec: getPositiveNumber(input.pollInterval, '--poll-interval'),
    waitTimeoutSec: getPositiveNumber(input.waitTimeout, '--wait-timeout'),
  };
}

function getWaitInput(arguments_: string[]): WaitInput {
  const input: WaitInput = { pollInterval: '2', waitTimeout: '600' };
  const seen = new Set<string>();

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const property = getWaitProperty(argument);
    if (!property) {
      throw new CommandUsageError(`Unknown or repeated assets wait option: ${String(argument)}`);
    }
    guardNewOption(seen, property, String(argument));
    input[property] = getOptionValue(arguments_, index, String(argument));
    index += 1;
  }

  return input;
}

function getWaitProperty(argument: string | undefined): keyof WaitInput | null {
  if (argument === '--poll-interval') {
    return 'pollInterval';
  }
  if (argument === '--wait-timeout') {
    return 'waitTimeout';
  }
  return null;
}

async function downloadAssetCommand(arguments_: string[]): Promise<void> {
  const options = getDownloadOptions(arguments_);
  if (getRuntimeOptions().json && options.output === '-') {
    throw new CommandUsageError('JSON output cannot be combined with assets download --output -.');
  }
  const asset = await getAsset(options.assetId);

  if (asset.status !== 'ready' || !asset.url) {
    throw new Error(`Asset ${asset.id} is not ready for download (status=${asset.status}).`);
  }

  await downloadAsset(asset.url, options.output, options.force);
  if (options.output !== '-') {
    if (getRuntimeOptions().json) {
      writeJson({ assetId: asset.id, output: options.output });
      return;
    }
    process.stdout.write(`Downloaded asset ${asset.id} to ${options.output}.\n`);
  }
}

function getDownloadOptions(arguments_: string[]): { assetId: string; force: boolean; output: string } {
  const assetId = getAssetId(arguments_, 'download');
  const input = getDownloadInput(arguments_.slice(1));

  if (!input.output) {
    throw new CommandUsageError('Assets download requires --output <path|->.');
  }
  return { assetId, force: input.force, output: input.output };
}

function getDownloadInput(arguments_: string[]): DownloadInput {
  const input: DownloadInput = { force: false, output: undefined };
  const seen = new Set<string>();

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--force') {
      guardNewOption(seen, 'force', argument);
      input.force = true;
      continue;
    }
    if (argument === '--output') {
      guardNewOption(seen, 'output', argument);
      input.output = getOptionValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    throw new CommandUsageError(`Unknown or repeated assets download option: ${String(argument)}`);
  }

  return input;
}

async function addCaptions(arguments_: string[]): Promise<void> {
  const assetId = getAssetId(arguments_, 'add-captions');
  const input = getCaptionInput(arguments_.slice(1));
  const options = getCaptionOptions(input);
  const response = await getApiResponse({
    body: {
      preset_id: options.presetId,
      font_size: options.fontSize,
      ...(options.color === undefined ? {} : { color: options.color }),
      ...(options.fontFamily === undefined ? {} : { font_family: options.fontFamily }),
      ...(options.fontWeight === undefined ? {} : { font_weight: options.fontWeight }),
      ...(options.textTransform === undefined ? {} : { text_transform: options.textTransform }),
      alignment: options.alignment,
      karaoke: options.karaoke,
      animated: options.animated,
      words_at_a_time: options.wordsAtATime,
    },
    method: 'POST',
    path: `assets/${encodeURIComponent(assetId)}/captions`,
    schema: transformResponseSchema,
  });
  writeTransformResponse('captions', response);
}

function getCaptionInput(arguments_: string[]): CaptionInput {
  const input: CaptionInput = {
    alignment: 'bottom', animated: true, fontSize: '80', karaoke: true,
    presetId: 'basic', wordsAtATime: 'short',
  };
  const seen = new Set<string>();

  for (let index = 0; index < arguments_.length; index += 1) {
    index = readCaptionArgument({ arguments_, index, input, seen });
  }

  return input;
}

function readCaptionArgument(
  values: CaptionArgument,
): number {
  const argument = values.arguments_[values.index];
  const booleanProperty = getCaptionBooleanProperty(argument);
  if (booleanProperty) {
    guardNewOption(values.seen, booleanProperty, String(argument));
    values.input[booleanProperty] = !argument?.startsWith('--no-');
    return values.index;
  }
  return readCaptionValue(values);
}

function readCaptionValue(values: CaptionArgument): number {
  const argument = values.arguments_[values.index];
  const property = getCaptionValueProperty(argument);
  if (!property) {
    throw new CommandUsageError(`Unknown or repeated assets add-captions option: ${String(argument)}`);
  }
  guardNewOption(values.seen, property, String(argument));
  values.input[property] = getOptionValue(values.arguments_, values.index, String(argument));
  return values.index + 1;
}

function getCaptionBooleanProperty(argument: string | undefined): 'animated' | 'karaoke' | null {
  if (argument === '--animated' || argument === '--no-animated') {
    return 'animated';
  }
  if (argument === '--karaoke' || argument === '--no-karaoke') {
    return 'karaoke';
  }
  return null;
}

function getCaptionValueProperty(argument: string | undefined): keyof Pick<
  CaptionInput,
  'alignment' | 'color' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'presetId' | 'textTransform' | 'wordsAtATime'
> | null {
  if (argument === '--alignment') {
    return 'alignment';
  }
  if (argument === '--color') {
    return 'color';
  }
  if (argument === '--font-family') {
    return 'fontFamily';
  }
  if (argument === '--font-size') {
    return 'fontSize';
  }
  if (argument === '--font-weight') {
    return 'fontWeight';
  }
  if (argument === '--preset-id') {
    return 'presetId';
  }
  if (argument === '--text-transform') {
    return 'textTransform';
  }
  if (argument === '--words-at-a-time') {
    return 'wordsAtATime';
  }
  return null;
}

function getCaptionOptions(input: CaptionInput): {
  alignment: z.infer<typeof alignmentSchema>;
  animated: boolean;
  color?: string;
  fontFamily?: string;
  fontSize: number;
  fontWeight?: number;
  karaoke: boolean;
  presetId: z.infer<typeof captionPresetSchema>;
  textTransform?: z.infer<typeof textTransformSchema>;
  wordsAtATime: z.infer<typeof wordsAtATimeSchema>;
} {
  const presetId = parseEnum(captionPresetSchema, input.presetId, '--preset-id');
  const alignment = parseEnum(alignmentSchema, input.alignment, '--alignment');
  const wordsAtATime = parseEnum(wordsAtATimeSchema, input.wordsAtATime, '--words-at-a-time');
  const textTransform = parseOptionalEnum(textTransformSchema, input.textTransform, '--text-transform');
  return {
    alignment,
    animated: input.animated,
    ...(input.color === undefined ? {} : { color: input.color }),
    ...(input.fontFamily === undefined ? {} : { fontFamily: input.fontFamily }),
    fontSize: getNumberInRange(input.fontSize, '--font-size', 10, 200),
    ...(input.fontWeight === undefined
      ? {}
      : { fontWeight: getFiniteNumber(input.fontWeight, '--font-weight') }),
    karaoke: input.karaoke,
    presetId,
    ...(textTransform === undefined ? {} : { textTransform }),
    wordsAtATime,
  };
}

async function upscaleAsset(arguments_: string[]): Promise<void> {
  const assetId = getAssetId(arguments_, 'upscale');
  const input = getUpscaleInput(arguments_.slice(1));
  const hasWidth = input.width !== undefined;
  if (hasWidth !== (input.height !== undefined)) {
    throw new CommandUsageError('Assets upscale requires --width and --height together.');
  }
  const width = input.width === undefined ? undefined : getInteger(input.width, '--width', 320, 3840);
  const height = input.height === undefined ? undefined : getInteger(input.height, '--height', 320, 3840);
  const outputFrameRate = input.outputFrameRate === undefined
    ? undefined
    : getInteger(input.outputFrameRate, '--output-frame-rate', 24, 60);
  const body = {
    ...(width === undefined || height === undefined ? {} : { output_resolution: { width, height } }),
    ...(outputFrameRate === undefined ? {} : { output_frame_rate: outputFrameRate }),
  };
  await runTransform(assetId, 'upscale', body);
}

function getUpscaleInput(arguments_: string[]): UpscaleInput {
  const input: UpscaleInput = {};
  const seen = new Set<string>();

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const property = getUpscaleProperty(argument);
    if (property) {
      guardNewOption(seen, property, String(argument));
      input[property] = getOptionValue(arguments_, index, String(argument));
      index += 1;
      continue;
    }
    throw new CommandUsageError(`Unknown or repeated assets upscale option: ${String(argument)}`);
  }
  return input;
}

function getUpscaleProperty(argument: string | undefined): keyof Pick<
  UpscaleInput,
  'height' | 'outputFrameRate' | 'width'
> | null {
  if (argument === '--width') {
    return 'width';
  }
  if (argument === '--height') {
    return 'height';
  }
  if (argument === '--output-frame-rate') {
    return 'outputFrameRate';
  }
  return null;
}

async function removeBackground(arguments_: string[]): Promise<void> {
  const assetId = getAssetId(arguments_, 'remove-background');
  const input = getRemoveBackgroundInput(arguments_.slice(1));
  const codec = parseEnum(outputCodecSchema, input.outputCodec, '--output-codec');
  await runTransform(assetId, 'remove-background', {
    subject_is_person: input.subjectIsPerson,
    refine_foreground_edges: input.refineForegroundEdges,
    output_codec: codec,
  });
}

function getRemoveBackgroundInput(arguments_: string[]): RemoveBackgroundInput {
  const input = { outputCodec: 'vp9', refineForegroundEdges: true, subjectIsPerson: true };
  const seen = new Set<string>();
  for (let index = 0; index < arguments_.length; index += 1) {
    index = readRemoveBackgroundArgument({ arguments_, index, input, seen });
  }
  return input;
}

function readRemoveBackgroundArgument(values: RemoveBackgroundArgument): number {
  const { arguments_, index, input, seen } = values;
  const argument = arguments_[index];
  if (argument === '--output-codec') {
    guardNewOption(seen, 'outputCodec', argument);
    input.outputCodec = getOptionValue(arguments_, index, argument);
    return index + 1;
  }
  const property = getRemoveBackgroundBooleanProperty(argument);
  if (!property) {
    throw new CommandUsageError(`Unknown or repeated assets remove-background option: ${String(argument)}`);
  }
  guardNewOption(seen, property, argument);
  input[property] = !argument?.startsWith('--no-');
  return index;
}

function getRemoveBackgroundBooleanProperty(
  argument: string | undefined,
): 'refineForegroundEdges' | 'subjectIsPerson' | null {
  if (argument === '--subject-is-person' || argument === '--no-subject-is-person') {
    return 'subjectIsPerson';
  }
  if (argument === '--refine-foreground-edges' || argument === '--no-refine-foreground-edges') {
    return 'refineForegroundEdges';
  }
  return null;
}

async function enhanceAudio(arguments_: string[]): Promise<void> {
  const assetId = getAssetId(arguments_, 'enhance-audio');
  const input = getEnhanceAudioInput(arguments_.slice(1));
  await runTransform(assetId, 'enhance-audio', {
    remove_noise: input.removeNoise,
    normalize: input.normalize,
    studio_sound: input.studioSound,
  });
}

function getEnhanceAudioInput(arguments_: string[]): EnhanceAudioInput {
  const input = { normalize: true, removeNoise: true, studioSound: true };
  const seen = new Set<string>();
  for (const argument of arguments_) {
    readEnhanceAudioArgument({ argument, input, seen });
  }
  return input;
}

function readEnhanceAudioArgument(values: EnhanceAudioArgument): void {
  const { argument, input, seen } = values;
  const property = getEnhanceAudioBooleanProperty(argument);
  if (!property) {
    throw new CommandUsageError(`Unknown or repeated assets enhance-audio option: ${argument}`);
  }
  guardNewOption(seen, property, argument);
  input[property] = !argument.startsWith('--no-');
}

function getEnhanceAudioBooleanProperty(argument: string): 'normalize' | 'removeNoise' | 'studioSound' | null {
  if (argument === '--remove-noise' || argument === '--no-remove-noise') {
    return 'removeNoise';
  }
  if (argument === '--normalize' || argument === '--no-normalize') {
    return 'normalize';
  }
  if (argument === '--studio-sound' || argument === '--no-studio-sound') {
    return 'studioSound';
  }
  return null;
}

async function runBodylessTransform(command: string, arguments_: string[]): Promise<void> {
  const assetId = getAssetId(arguments_, command);
  guardNoExtraOptions(arguments_, command);
  const path = command === 'transcribe' ? 'transcription' : command;
  const response = await getApiResponse({
    method: 'POST', path: `assets/${encodeURIComponent(assetId)}/${path}`, schema: transformResponseSchema,
  });

  if (command === 'transcribe' && !getRuntimeOptions().json) {
    process.stdout.write(
      `Started transcription for asset ${response.assetId}. The current API does not expose transcription completion or result data.\n`,
    );
    return;
  }
  writeTransformResponse(command, response);
}

async function runTransform(assetId: string, path: string, body: unknown): Promise<void> {
  const response = await getApiResponse({
    body, method: 'POST', path: `assets/${encodeURIComponent(assetId)}/${path}`, schema: transformResponseSchema,
  });
  writeTransformResponse(path, response);
}

async function getAsset(assetId: string, timeoutMs?: number): Promise<z.infer<typeof assetSchema>> {
  return getApiResponse({
    method: 'GET',
    path: `assets/${encodeURIComponent(assetId)}`,
    schema: assetSchema,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

function guardNoExtraOptions(arguments_: string[], command: string): void {
  if (arguments_.length > 1) {
    throw new CommandUsageError(`Unknown or repeated assets ${command} option: ${String(arguments_[1])}`);
  }
}

function getAssetId(arguments_: string[], command: string): string {
  const assetId = arguments_[0];
  if (!assetId || assetId.startsWith('-')) {
    throw new CommandUsageError(`Assets ${command} requires <asset-id>.`);
  }
  return assetId;
}

function writeAsset(asset: z.infer<typeof assetSchema>): void {
  if (getRuntimeOptions().json) {
    writeJson(asset);
    return;
  }
  writeAssetLine(asset);
}

function writeAssetLine(asset: z.infer<typeof assetSchema>): void {
  process.stdout.write(`${asset.id}\t${asset.kind}\t${asset.status}\t${asset.name ?? '-'}\t${asset.url ?? '-'}\n`);
}

function writeWaitNotice(asset: z.infer<typeof assetSchema>): void {
  if (getRuntimeOptions().nonInteractive || !process.stderr.isTTY) {
    return;
  }
  const progress = asset.progress === undefined ? '' : ` (${String(asset.progress)}%)`;
  process.stderr.write(`Waiting for asset ${asset.id}: ${asset.status}${progress}.\n`);
}

function throwWaitTimeout(assetId: string, waitTimeoutSec: number): never {
  throw new CliError({
    exitCode: 4,
    message: `Timed out waiting for asset ${assetId} after ${String(waitTimeoutSec)} seconds.`,
    type: 'timeout_error',
  });
}

function writeTransformResponse(
  name: string,
  response: z.infer<typeof transformResponseSchema>,
): void {
  if (getRuntimeOptions().json) {
    writeJson(response);
    return;
  }
  process.stdout.write(`Started ${name} asset ${response.assetId} (${response.status}).\n`);
}

function guardNewOption(seen: Set<string>, property: string, option: string | undefined): void {
  if (seen.has(property)) {
    throw new CommandUsageError(`Unknown or repeated assets option: ${String(option)}`);
  }
  seen.add(property);
}

function getOptionValue(arguments_: string[], index: number, option: string): string {
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new CommandUsageError(`${option} requires a value.`);
  }
  return value;
}

function getInteger(value: string, option: string, minimum: number, maximum: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new CommandUsageError(`${option} must be an integer from ${String(minimum)} to ${String(maximum)}.`);
  }
  return number;
}

function getPositiveNumber(value: string, option: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new CommandUsageError(`${option} must be a positive number.`);
  }
  return number;
}

function getFiniteNumber(value: string, option: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new CommandUsageError(`${option} must be a number.`);
  }
  return number;
}

function getNumberInRange(value: string, option: string, minimum: number, maximum: number): number {
  const number = getFiniteNumber(value, option);
  if (number < minimum || number > maximum) {
    throw new CommandUsageError(`${option} must be from ${String(minimum)} to ${String(maximum)}.`);
  }
  return number;
}

function parseEnum<Value extends string>(
  schema: z.ZodType<Value>,
  value: string,
  option: string,
): Value {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new CommandUsageError(`${option} has an unsupported value.`);
  }
  return parsed.data;
}

function parseOptionalEnum<Value extends string>(
  schema: z.ZodType<Value>,
  value: string | undefined,
  option: string,
): Value | undefined {
  if (value === undefined) {
    return undefined;
  }
  return parseEnum(schema, value, option);
}

function showAssetsHelp(): void {
  process.stdout.write(`Usage: viewpress assets <command>\n\nCommands:\n  list                  List assets in a video\n  get                   Get one asset\n  wait                  Wait for an asset to finish\n  download              Download a ready asset\n  add-captions          Add captions to a ready video\n  smooth                Smooth a ready video\n  humanize              Humanize a ready video\n  upscale               Upscale a ready video\n  remove-background     Remove a ready video's background\n  enhance-audio         Enhance a ready video's audio\n  transcribe            Start transcription (completion/result unavailable in v1)\n`);
}

function showAssetCommandHelp(command: string): void {
  const usage: Record<string, string> = {
    list: 'viewpress assets list --video-id <id> [--kind image|video|audio|sfx|music|render] [--limit <1..200>] [--json]',
    get: 'viewpress assets get <asset-id> [--json]',
    wait: 'viewpress assets wait <asset-id> [--wait-timeout <seconds>] [--poll-interval <seconds>] [--json]',
    download: 'viewpress assets download <asset-id> --output <path|-> [--force] [--json]\n\n--json writes file download metadata and cannot be used with --output -.',
    'add-captions': 'viewpress assets add-captions <asset-id> [--preset-id <preset>] [--font-size <10..200>] [--color <color>] [--font-family <family>] [--font-weight <number>] [--text-transform uppercase|lowercase|none] [--alignment top|middle|bottom] [--karaoke|--no-karaoke] [--animated|--no-animated] [--words-at-a-time one|short|long] [--json]',
    smooth: 'viewpress assets smooth <asset-id> [--json]',
    humanize: 'viewpress assets humanize <asset-id> [--json]',
    upscale: 'viewpress assets upscale <asset-id> [--width <320..3840> --height <320..3840>] [--output-frame-rate <24..60>] [--json]',
    'remove-background': 'viewpress assets remove-background <asset-id> [--subject-is-person|--no-subject-is-person] [--refine-foreground-edges|--no-refine-foreground-edges] [--output-codec vp9|h264] [--json]',
    'enhance-audio': 'viewpress assets enhance-audio <asset-id> [--remove-noise|--no-remove-noise] [--normalize|--no-normalize] [--studio-sound|--no-studio-sound] [--json]',
    transcribe: 'viewpress assets transcribe <asset-id> [--json]\n\nThe current v1 API starts transcription but does not expose its completion state or transcript result.',
  };
  const commandUsage = usage[command];
  if (!commandUsage) {
    throw new CommandUsageError(`Unknown assets command: ${command}`);
  }
  process.stdout.write(`Usage: ${commandUsage}\n`);
}
