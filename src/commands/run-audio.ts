import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { getApiResponse } from '../api/get-api-response.ts';
import { getRuntimeOptions } from '../cli/runtime-options.ts';
import { writeJson } from '../output/write-json.ts';
import { writeError } from '../output/write-error.ts';
import { CommandUsageError } from './command-usage-error.ts';

const audioResponseSchema = z.object({
  assetId: z.string(),
  status: z.literal('pending'),
});
const nameSchema = z.string().min(1).max(120);
const speechTextSchema = z.string().min(1).max(10_000);
const promptSchema = z.string().min(3);
const styleSchema = z.string().min(2);
const voicePresetSchema = z.enum([
  'Wise_Woman',
  'Friendly_Person',
  'Inspirational_girl',
  'Deep_Voice_Man',
  'Calm_Woman',
  'Casual_Guy',
  'Lively_Girl',
  'Patient_Man',
  'Young_Knight',
  'Determined_Man',
  'Lovely_Girl',
  'Decent_Boy',
  'Imposing_Manner',
  'Elegant_Man',
  'Abbess',
  'Sweet_Girl_2',
  'Exuberant_Girl',
]);
const emotionSchema = z.enum(['happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'neutral']);

interface MusicInput {
  description: string | undefined;
  durationSeconds: string | undefined;
  instrumentalOnly: boolean;
  name: string | undefined;
  prompt: string | undefined;
  promptFile: string | undefined;
  style: string | undefined;
  videoId: string | undefined;
}

interface MusicArgument {
  arguments_: string[];
  index: number;
  input: MusicInput;
  seen: Set<string>;
}

interface SfxInput {
  description: string | undefined;
  durationSeconds: string;
  name: string | undefined;
  prompt: string | undefined;
  promptFile: string | undefined;
  promptInfluence: string;
  videoId: string | undefined;
}

interface SfxArgument {
  arguments_: string[];
  index: number;
  input: SfxInput;
  seen: Set<string>;
}

interface SpeechInput {
  emotion: string | undefined;
  englishNormalization: boolean | undefined;
  languageBoost: string | undefined;
  name: string | undefined;
  pitch: string | undefined;
  speed: string | undefined;
  text: string | undefined;
  textFile: string | undefined;
  videoId: string | undefined;
  voicePreset: string | undefined;
  voiceRecordId: string | undefined;
  vol: string | undefined;
}

export async function runAudio(resource: 'music' | 'sfx' | 'speech', arguments_: string[]): Promise<number> {
  try {
    const command = arguments_[0];

    if (command === 'generate') {
      await generateAudio(resource, arguments_.slice(1));
      return 0;
    }

    if (command === undefined || (command === '--help' && arguments_.length === 1)) {
      if (getRuntimeOptions().json) {
        throw new CommandUsageError(`A ${resource} command is required with --json.`);
      }
      showAudioHelp(resource);
      return 0;
    }

    throw new CommandUsageError(`Unknown ${resource} command: ${command}`);
  } catch (error) {
    if (error instanceof CommandUsageError && error.commandPath === undefined) {
      return writeError(
        new CommandUsageError(error.message, getAudioCommandPath(resource, arguments_[0])),
        `${resource} command failed.`,
      );
    }
    return writeError(error, `${resource} command failed.`);
  }
}

function getAudioCommandPath(resource: 'music' | 'sfx' | 'speech', command: string | undefined): string {
  if (command === 'generate') {
    return `${resource} generate`;
  }
  return resource;
}

async function generateAudio(resource: 'music' | 'sfx' | 'speech', arguments_: string[]): Promise<void> {
  if (arguments_.includes('--help')) {
    showAudioGenerateHelp(resource);
    return;
  }

  if (resource === 'speech') {
    await generateSpeech(arguments_);
    return;
  }

  if (resource === 'music') {
    await generateMusic(arguments_);
    return;
  }

  await generateSfx(arguments_);
}

async function generateSpeech(arguments_: string[]): Promise<void> {
  const input = getSpeechInput(arguments_);
  const text = await getFileInput(input.text, input.textFile);
  const options = getSpeechOptions(input, text);
  const response = await getApiResponse({
    body: {
      emotion: options.emotion,
      english_normalization: options.englishNormalization,
      language_boost: options.languageBoost,
      name: options.name,
      pitch: options.pitch,
      speed: options.speed,
      text: options.text,
      video_id: options.videoId,
      voice_preset: options.voicePreset,
      voice_record_id: options.voiceRecordId,
      vol: options.vol,
    },
    method: 'POST',
    path: 'speech',
    schema: audioResponseSchema,
  });
  writeAudioResponse('speech', response);
}

function getSpeechInput(arguments_: string[]): SpeechInput {
  const input: SpeechInput = {
    emotion: undefined,
    englishNormalization: undefined,
    languageBoost: undefined,
    name: undefined,
    pitch: undefined,
    speed: undefined,
    text: undefined,
    textFile: undefined,
    videoId: undefined,
    voicePreset: undefined,
    voiceRecordId: undefined,
    vol: undefined,
  };
  const seen = new Set<string>();

  for (let index = 0; index < arguments_.length; index += 1) {
    index = readSpeechArgument(arguments_, index, input, seen);
  }

  return input;
}

function readSpeechArgument(arguments_: string[], index: number, input: SpeechInput, seen: Set<string>): number {
  const argument = arguments_[index];

  if (argument === '--english-normalization' || argument === '--no-english-normalization') {
    guardNewOption(seen, 'englishNormalization', argument);
    input.englishNormalization = argument === '--english-normalization';
    return index;
  }

  const property = getSpeechProperty(argument);
  if (!property) {
    throwUnknownArgument(argument);
  }
  if (property === 'text' || property === 'textFile') {
    guardTextOption(seen, property, String(argument));
  } else if (property === 'voicePreset' || property === 'voiceRecordId') {
    guardVoiceOption(seen, property, String(argument));
  } else {
    guardNewOption(seen, property, String(argument));
  }
  input[property] = getOptionValue(arguments_, index, String(argument));
  return index + 1;
}

function getSpeechProperty(argument: string | undefined): keyof Omit<SpeechInput, 'englishNormalization'> | null {
  if (argument === '--emotion') {
    return 'emotion';
  }
  if (argument === '--language-boost') {
    return 'languageBoost';
  }
  if (argument === '--name') {
    return 'name';
  }
  if (argument === '--pitch') {
    return 'pitch';
  }
  if (argument === '--speed') {
    return 'speed';
  }
  if (argument === '--text') {
    return 'text';
  }
  if (argument === '--text-file') {
    return 'textFile';
  }
  if (argument === '--video-id') {
    return 'videoId';
  }
  if (argument === '--voice-preset') {
    return 'voicePreset';
  }
  if (argument === '--voice-record-id') {
    return 'voiceRecordId';
  }
  if (argument === '--vol') {
    return 'vol';
  }
  return null;
}

function getSpeechOptions(input: SpeechInput, textInput: string | undefined): {
  emotion: z.infer<typeof emotionSchema> | undefined;
  englishNormalization: boolean | undefined;
  languageBoost: string | undefined;
  name: string;
  pitch: number | undefined;
  speed: number | undefined;
  text: string;
  videoId: string;
  voicePreset: z.infer<typeof voicePresetSchema> | undefined;
  voiceRecordId: string | undefined;
  vol: number | undefined;
} {
  const common = getCommonValues(input.videoId, input.name);
  const text = speechTextSchema.safeParse(textInput);
  if (!text.success) {
    throw new CommandUsageError('Speech generate requires --text or --text-file with 1 to 10000 characters.');
  }

  const voicePreset = getOptionalEnum(input.voicePreset, voicePresetSchema, `Speech --voice-preset must be ${voicePresetSchema.options.join(', ')}.`);
  const emotion = getOptionalEnum(input.emotion, emotionSchema, `Speech --emotion must be ${emotionSchema.options.join(', ')}.`);
  return {
    emotion,
    englishNormalization: input.englishNormalization,
    languageBoost: input.languageBoost,
    name: common.name,
    pitch: getOptionalNumber(input.pitch, -12, 12, 'Speech --pitch must be an integer from -12 to 12.', true),
    speed: getOptionalNumber(input.speed, 0.5, 2, 'Speech --speed must be a number from 0.5 to 2.'),
    text: text.data,
    videoId: common.videoId,
    voicePreset,
    voiceRecordId: input.voiceRecordId,
    vol: getOptionalNumber(input.vol, 0.01, 10, 'Speech --vol must be a number from 0.01 to 10.'),
  };
}

async function generateMusic(arguments_: string[]): Promise<void> {
  const input = getMusicInput(arguments_);
  const common = getCommonValues(input.videoId, input.name);
  const prompt = getRequiredPrompt(await getFileInput(input.prompt, input.promptFile), 'Music');
  const style = styleSchema.safeParse(input.style);
  if (!style.success) {
    throw new CommandUsageError('Music generate requires --style with at least 2 characters.');
  }
  const durationSeconds = getRequiredNumber(input.durationSeconds, 3, 480, 'Music --duration-seconds must be a number from 3 to 480.');
  const response = await getApiResponse({
    body: {
      description: input.description,
      duration_seconds: durationSeconds,
      instrumental_only: input.instrumentalOnly,
      name: common.name,
      prompt,
      style: style.data,
      video_id: common.videoId,
    },
    method: 'POST',
    path: 'music',
    schema: audioResponseSchema,
  });
  writeAudioResponse('music', response);
}

function getMusicInput(arguments_: string[]): MusicInput {
  const input: MusicInput = {
    description: undefined, durationSeconds: undefined, instrumentalOnly: true, name: undefined,
    prompt: undefined, promptFile: undefined, style: undefined, videoId: undefined,
  };
  const seen = new Set<string>();

  for (let index = 0; index < arguments_.length; index += 1) {
    index = readMusicArgument({ arguments_, index, input, seen });
  }

  return input;
}

function readMusicArgument(values: MusicArgument): number {
  const argument = values.arguments_[values.index];

  if (argument === '--instrumental-only' || argument === '--no-instrumental-only') {
    guardNewOption(values.seen, 'instrumentalOnly', argument);
    values.input.instrumentalOnly = argument === '--instrumental-only';
    return values.index;
  }

  const property = getMusicProperty(argument);
  if (!property) {
    throwUnknownArgument(argument);
  }
  if (property === 'prompt' || property === 'promptFile') {
    guardPromptOption(values.seen, property, String(argument));
  } else {
    guardNewOption(values.seen, property, String(argument));
  }
  values.input[property] = getOptionValue(values.arguments_, values.index, String(argument));
  return values.index + 1;
}

function getMusicProperty(argument: string | undefined): keyof Omit<MusicInput, 'instrumentalOnly'> | null {
  if (argument === '--description') {
    return 'description';
  }
  if (argument === '--duration-seconds') {
    return 'durationSeconds';
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
  if (argument === '--style') {
    return 'style';
  }
  if (argument === '--video-id') {
    return 'videoId';
  }
  return null;
}

async function generateSfx(arguments_: string[]): Promise<void> {
  const input = getSfxInput(arguments_);
  const common = getCommonValues(input.videoId, input.name);
  const prompt = getRequiredPrompt(await getFileInput(input.prompt, input.promptFile), 'SFX');
  const durationSeconds = getRequiredNumber(input.durationSeconds, 0.5, 10, 'SFX --duration-seconds must be a number from 0.5 to 10.');
  const promptInfluence = getRequiredNumber(input.promptInfluence, 0, 1, 'SFX --prompt-influence must be a number from 0 to 1.');
  const response = await getApiResponse({
    body: {
      description: input.description,
      duration_seconds: durationSeconds,
      name: common.name,
      prompt,
      prompt_influence: promptInfluence,
      video_id: common.videoId,
    },
    method: 'POST',
    path: 'sfx',
    schema: audioResponseSchema,
  });
  writeAudioResponse('sfx', response);
}

function getSfxInput(arguments_: string[]): SfxInput {
  const input: SfxInput = {
    description: undefined, durationSeconds: '2', name: undefined,
    prompt: undefined, promptFile: undefined, promptInfluence: '0.5', videoId: undefined,
  };
  const seen = new Set<string>();

  for (let index = 0; index < arguments_.length; index += 1) {
    index = readSfxArgument({ arguments_, index, input, seen });
  }

  return input;
}

function readSfxArgument(values: SfxArgument): number {
  const argument = values.arguments_[values.index];
  const property = getSfxProperty(argument);
  if (!property) {
    throwUnknownArgument(argument);
  }
  if (property === 'prompt' || property === 'promptFile') {
    guardPromptOption(values.seen, property, String(argument));
  } else {
    guardNewOption(values.seen, property, String(argument));
  }
  values.input[property] = getOptionValue(values.arguments_, values.index, String(argument));
  return values.index + 1;
}

function getSfxProperty(argument: string | undefined): keyof SfxInput | null {
  if (argument === '--description') {
    return 'description';
  }
  if (argument === '--duration-seconds') {
    return 'durationSeconds';
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
  if (argument === '--prompt-influence') {
    return 'promptInfluence';
  }
  if (argument === '--video-id') {
    return 'videoId';
  }
  return null;
}

function getRequiredPrompt(promptInput: string | undefined, label: string): string {
  const prompt = promptSchema.safeParse(promptInput);
  if (!prompt.success) {
    throw new CommandUsageError(`${label} generate requires --prompt or --prompt-file with at least 3 characters.`);
  }
  return prompt.data;
}

function getCommonValues(videoIdInput: string | undefined, nameInput: string | undefined): { name: string; videoId: string } {
  if (!videoIdInput) {
    throw new CommandUsageError('Audio generate commands require --video-id.');
  }
  const name = nameSchema.safeParse(nameInput);
  if (!name.success) {
    throw new CommandUsageError('Audio generate commands require --name with 1 to 120 characters.');
  }
  return { name: name.data, videoId: videoIdInput };
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

function guardTextOption(seen: Set<string>, property: 'text' | 'textFile', option: string): void {
  const conflictingProperty = property === 'text' ? 'textFile' : 'text';
  if (seen.has(property)) {
    throw new CommandUsageError(`Flag ${option} cannot be repeated.`);
  }
  if (seen.has(conflictingProperty)) {
    throw new CommandUsageError('Specify only one of --text or --text-file.');
  }
  seen.add(property);
}

function guardVoiceOption(seen: Set<string>, property: 'voicePreset' | 'voiceRecordId', option: string): void {
  const conflictingProperty = property === 'voicePreset' ? 'voiceRecordId' : 'voicePreset';
  if (seen.has(property)) {
    throw new CommandUsageError(`Flag ${option} cannot be repeated.`);
  }
  if (seen.has(conflictingProperty)) {
    throw new CommandUsageError('Specify only one of --voice-preset or --voice-record-id.');
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

async function getFileInput(value: string | undefined, file: string | undefined): Promise<string | undefined> {
  if (value !== undefined) {
    return value;
  }
  if (file === undefined) {
    return undefined;
  }
  if (file === '-') {
    return new Response(Bun.stdin.stream()).text();
  }
  return readFile(file, 'utf8');
}

function getOptionalNumber(value: string | undefined, minimum: number, maximum: number, message: string, integer = false): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum || (integer && !Number.isInteger(number))) {
    throw new CommandUsageError(message);
  }
  return number;
}

function getRequiredNumber(value: string | undefined, minimum: number, maximum: number, message: string): number {
  const number = getOptionalNumber(value, minimum, maximum, message);
  if (number === undefined) {
    throw new CommandUsageError(message);
  }
  return number;
}

function getOptionalEnum<Value extends string>(
  value: string | undefined,
  schema: z.ZodType<Value>,
  message: string,
): Value | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new CommandUsageError(message);
  }
  return parsed.data;
}

function writeAudioResponse(resource: string, response: z.infer<typeof audioResponseSchema>): void {
  if (getRuntimeOptions().json) {
    writeJson(response);
    return;
  }
  process.stdout.write(`Started ${resource} asset ${response.assetId} (${response.status}).\n`);
}

function showAudioHelp(resource: 'music' | 'sfx' | 'speech'): void {
  process.stdout.write(`Usage: viewpress ${resource} generate [options]\n`);
}

function showAudioGenerateHelp(resource: 'music' | 'sfx' | 'speech'): void {
  if (resource === 'speech') {
    process.stdout.write('Usage: viewpress speech generate --video-id <id> --name <name> (--text <text> | --text-file <path|->) [options]\n');
    return;
  }
  if (resource === 'music') {
    process.stdout.write('Usage: viewpress music generate --video-id <id> --name <name> (--prompt <text> | --prompt-file <path|->) --style <style> --duration-seconds <seconds> [options]\n');
    return;
  }
  process.stdout.write('Usage: viewpress sfx generate --video-id <id> --name <name> (--prompt <text> | --prompt-file <path|->) [options]\n');
}
