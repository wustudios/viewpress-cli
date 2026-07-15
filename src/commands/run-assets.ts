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
  json: boolean;
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
  json: boolean;
  outputFrameRate?: string;
  width?: string;
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
  if (arguments_.length === 1 && (arguments_[0] === '--help' || arguments_[0] === '-h')) {
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

  if (options.json) {
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

function getListOptions(arguments_: string[]): {
  json: boolean;
  kind?: z.infer<typeof assetKindSchema>;
  limit: number;
  videoId: string;
} {
  let json = false;
  let kind: string | undefined;
  let limit = '50';
  let videoId: string | undefined;
  const seen = new Set<string>();

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--json') {
      guardNewOption(seen, 'json', argument);
      json = true;
      continue;
    }
    if (argument === '--video-id' || argument === '--kind' || argument === '--limit') {
      guardNewOption(seen, argument, argument);
      const value = getOptionValue(arguments_, index, argument);
      index += 1;
      if (argument === '--video-id') {
        videoId = value;
      }
      if (argument === '--kind') {
        kind = value;
      }
      if (argument === '--limit') {
        limit = value;
      }
      continue;
    }
    throw new CommandUsageError(`Unknown or repeated assets list option: ${String(argument)}`);
  }

  if (!videoId) {
    throw new CommandUsageError('Assets list requires --video-id.');
  }
  const parsedKind = kind === undefined ? undefined : assetKindSchema.safeParse(kind);
  if (parsedKind && !parsedKind.success) {
    throw new CommandUsageError('Assets --kind must be image, video, audio, sfx, music, or render.');
  }
  return {
    json,
    ...(parsedKind?.data === undefined ? {} : { kind: parsedKind.data }),
    limit: getInteger(limit, '--limit', 1, 200),
    videoId,
  };
}

async function getAssetCommand(arguments_: string[]): Promise<void> {
  const { assetId, json } = getAssetAndJson(arguments_, 'get');
  const asset = await getAsset(assetId);
  writeAsset(asset, json);
}

async function waitForAsset(arguments_: string[]): Promise<void> {
  const options = getWaitOptions(arguments_);
  const deadline = Date.now() + options.waitTimeoutSec * 1000;

  while (Date.now() <= deadline) {
    const remainingRequestMs = deadline - Date.now();
    if (remainingRequestMs <= 0) {
      throwWaitTimeout(options.assetId, options.waitTimeoutSec);
    }
    const asset = await getAssetBeforeDeadline({
      assetId: options.assetId,
      deadline,
      remainingMs: remainingRequestMs,
      waitTimeoutSec: options.waitTimeoutSec,
    });
    if (asset.status === 'ready') {
      writeAsset(asset, options.json);
      return;
    }
    if (asset.status === 'error' || asset.status === 'validation_error' || asset.status === 'canceled') {
      throw new CliError({
        exitCode: 1,
        message: `Asset ${asset.id} ended with status ${asset.status}${asset.error ? `: ${asset.error}` : '.'}`,
        type: 'terminal_error',
      });
    }
    writeWaitNotice(asset, options.json);
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throwWaitTimeout(asset.id, options.waitTimeoutSec);
    }
    await Bun.sleep(Math.min(options.pollIntervalSec * 1000, remainingMs));
  }

  throwWaitTimeout(options.assetId, options.waitTimeoutSec);
}

async function getAssetBeforeDeadline(
  arguments_: { assetId: string; deadline: number; remainingMs: number; waitTimeoutSec: number },
): Promise<z.infer<typeof assetSchema>> {
  try {
    const asset = await getAsset(arguments_.assetId, arguments_.remainingMs);
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

function getWaitOptions(arguments_: string[]): {
  assetId: string;
  json: boolean;
  pollIntervalSec: number;
  waitTimeoutSec: number;
} {
  const assetId = getAssetId(arguments_, 'wait');
  let json = false;
  let pollInterval = '2';
  let waitTimeout = '600';
  const seen = new Set<string>();

  for (let index = 1; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--json') {
      guardNewOption(seen, 'json', argument);
      json = true;
      continue;
    }
    if (argument === '--poll-interval' || argument === '--wait-timeout') {
      guardNewOption(seen, argument, argument);
      const value = getOptionValue(arguments_, index, argument);
      index += 1;
      if (argument === '--poll-interval') {
        pollInterval = value;
      } else {
        waitTimeout = value;
      }
      continue;
    }
    throw new CommandUsageError(`Unknown or repeated assets wait option: ${String(argument)}`);
  }

  return {
    assetId,
    json,
    pollIntervalSec: getPositiveNumber(pollInterval, '--poll-interval'),
    waitTimeoutSec: getPositiveNumber(waitTimeout, '--wait-timeout'),
  };
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
  let force = false;
  let output: string | undefined;
  const seen = new Set<string>();

  for (let index = 1; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--json') {
      guardNewOption(seen, 'json', argument);
      continue;
    }
    if (argument === '--force') {
      guardNewOption(seen, 'force', argument);
      force = true;
      continue;
    }
    if (argument === '--output') {
      guardNewOption(seen, 'output', argument);
      output = getOptionValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    throw new CommandUsageError(`Unknown or repeated assets download option: ${String(argument)}`);
  }

  if (!output) {
    throw new CommandUsageError('Assets download requires --output <path|->.');
  }
  return { assetId, force, output };
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
  writeTransformResponse('captions', response, options.json);
}

function getCaptionInput(arguments_: string[]): CaptionInput {
  const input: CaptionInput = {
    alignment: 'bottom', animated: true, fontSize: '80', json: false, karaoke: true,
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
  if (argument === '--json') {
    guardNewOption(values.seen, 'json', argument);
    values.input.json = true;
    return values.index;
  }
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
  json: boolean;
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
    json: input.json,
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
  await runTransform(assetId, 'upscale', body, input.json);
}

function getUpscaleInput(arguments_: string[]): UpscaleInput {
  const input: UpscaleInput = { json: false };
  const seen = new Set<string>();

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--json') {
      guardNewOption(seen, 'json', argument);
      input.json = true;
      continue;
    }
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
  let json = false;
  let outputCodec = 'vp9';
  let refineForegroundEdges = true;
  let subjectIsPerson = true;
  const seen = new Set<string>();

  for (let index = 1; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--json') {
      guardNewOption(seen, 'json', argument);
      json = true;
      continue;
    }
    if (argument === '--output-codec') {
      guardNewOption(seen, 'outputCodec', argument);
      outputCodec = getOptionValue(arguments_, index, argument);
      index += 1;
      continue;
    }
    const property = getRemoveBackgroundBooleanProperty(argument);
    if (property) {
      guardNewOption(seen, property, String(argument));
      const value = !argument?.startsWith('--no-');
      if (property === 'subjectIsPerson') {
        subjectIsPerson = value;
      } else {
        refineForegroundEdges = value;
      }
      continue;
    }
    throw new CommandUsageError(`Unknown or repeated assets remove-background option: ${String(argument)}`);
  }

  const codec = parseEnum(outputCodecSchema, outputCodec, '--output-codec');
  await runTransform(assetId, 'remove-background', {
    subject_is_person: subjectIsPerson, refine_foreground_edges: refineForegroundEdges, output_codec: codec,
  }, json);
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
  let json = false;
  let normalize = true;
  let removeNoise = true;
  let studioSound = true;
  const seen = new Set<string>();

  for (const argument of arguments_.slice(1)) {
    if (argument === '--json') {
      guardNewOption(seen, 'json', argument);
      json = true;
      continue;
    }
    const property = getEnhanceAudioBooleanProperty(argument);
    if (!property) {
      throw new CommandUsageError(`Unknown or repeated assets enhance-audio option: ${argument}`);
    }
    guardNewOption(seen, property, argument);
    const value = !argument.startsWith('--no-');
    if (property === 'removeNoise') {
      removeNoise = value;
    }
    if (property === 'normalize') {
      normalize = value;
    }
    if (property === 'studioSound') {
      studioSound = value;
    }
  }

  await runTransform(assetId, 'enhance-audio', {
    remove_noise: removeNoise, normalize, studio_sound: studioSound,
  }, json);
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
  const { assetId, json } = getAssetAndJson(arguments_, command);
  const path = command === 'transcribe' ? 'transcription' : command;
  const response = await getApiResponse({
    method: 'POST', path: `assets/${encodeURIComponent(assetId)}/${path}`, schema: transformResponseSchema,
  });

  if (command === 'transcribe' && !json) {
    process.stdout.write(
      `Started transcription for asset ${response.assetId}. The current API does not expose transcription completion or result data.\n`,
    );
    return;
  }
  writeTransformResponse(command, response, json);
}

async function runTransform(assetId: string, path: string, body: unknown, json: boolean): Promise<void> {
  const response = await getApiResponse({
    body, method: 'POST', path: `assets/${encodeURIComponent(assetId)}/${path}`, schema: transformResponseSchema,
  });
  writeTransformResponse(path, response, json);
}

async function getAsset(assetId: string, timeoutMs?: number): Promise<z.infer<typeof assetSchema>> {
  return getApiResponse({
    method: 'GET',
    path: `assets/${encodeURIComponent(assetId)}`,
    schema: assetSchema,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

function getAssetAndJson(arguments_: string[], command: string): { assetId: string; json: boolean } {
  const assetId = getAssetId(arguments_, command);
  if (arguments_.length === 1) {
    return { assetId, json: false };
  }
  if (arguments_.length === 2 && arguments_[1] === '--json') {
    return { assetId, json: true };
  }
  throw new CommandUsageError(`Unknown or repeated assets ${command} option: ${String(arguments_[1])}`);
}

function getAssetId(arguments_: string[], command: string): string {
  const assetId = arguments_[0];
  if (!assetId || assetId.startsWith('-')) {
    throw new CommandUsageError(`Assets ${command} requires <asset-id>.`);
  }
  return assetId;
}

function writeAsset(asset: z.infer<typeof assetSchema>, json: boolean): void {
  if (json) {
    writeJson(asset);
    return;
  }
  writeAssetLine(asset);
}

function writeAssetLine(asset: z.infer<typeof assetSchema>): void {
  process.stdout.write(`${asset.id}\t${asset.kind}\t${asset.status}\t${asset.name ?? '-'}\t${asset.url ?? '-'}\n`);
}

function writeWaitNotice(asset: z.infer<typeof assetSchema>, json: boolean): void {
  if (json || getRuntimeOptions().nonInteractive || !process.stderr.isTTY) {
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
  json: boolean,
): void {
  if (json) {
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
    download: 'viewpress assets download <asset-id> --output <path|-> [--force]',
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
