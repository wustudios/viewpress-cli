import { z } from 'zod';

import { getApiResponse } from '../api/get-api-response.ts';
import { getRuntimeOptions } from '../cli/runtime-options.ts';
import { writeJson } from '../output/write-json.ts';
import { writeError } from '../output/write-error.ts';
import { CommandUsageError } from './command-usage-error.ts';

const styleInputsSchema = z.object({
  startImage: z.boolean(),
  endImage: z.boolean(),
  referenceImages: z.number(),
  referenceVideos: z.number(),
  referenceAudio: z.number(),
  negativePrompt: z.boolean(),
});
const stylesResponseSchema = z.object({
  videoStyles: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      useFor: z.string(),
      durationSec: z.object({ min: z.number(), max: z.number() }),
      creditsPerSecond: z.number(),
      inputs: styleInputsSchema,
    }),
  ),
  imageModels: z.array(z.object({ code: z.string(), useFor: z.string(), credits: z.number() })),
});

export async function runStyles(arguments_: string[]): Promise<number> {
  try {
    const command = arguments_[0];

    if (command === 'list') {
      if (arguments_.includes('--help')) {
        showStylesListHelp();
        return 0;
      }
      await listStyles(arguments_.slice(1));
      return 0;
    }

    if (command === undefined || (command === '--help' && arguments_.length === 1)) {
      if (getRuntimeOptions().json) {
        throw new CommandUsageError('A styles command is required with --json.');
      }
      showStylesHelp();
      return 0;
    }

    throw new CommandUsageError(`Unknown styles command: ${command}`);
  } catch (error) {
    if (error instanceof CommandUsageError && error.commandPath === undefined) {
      return writeError(
        new CommandUsageError(error.message, getStylesCommandPath(arguments_[0])),
        'Styles command failed.',
      );
    }
    return writeError(error, 'Styles command failed.');
  }
}

function getStylesCommandPath(command: string | undefined): string {
  if (command === 'list') {
    return 'styles list';
  }
  return 'styles';
}

async function listStyles(arguments_: string[]): Promise<void> {
  guardNoArguments(arguments_);
  const response = await getApiResponse({ method: 'GET', path: 'styles', schema: stylesResponseSchema });

  if (getRuntimeOptions().json) {
    writeJson(response);
    return;
  }

  for (const style of response.videoStyles) {
    const duration = `${String(style.durationSec.min)}-${String(style.durationSec.max)}s`;
    process.stdout.write(`${style.code}\t${style.label}\t${duration}\t${String(style.creditsPerSecond)} credits/s\n`);
  }

  for (const model of response.imageModels) {
    process.stdout.write(`${model.code}\timage\t${String(model.credits)} credits\n`);
  }
}

function guardNoArguments(arguments_: string[]): void {
  if (arguments_.length > 0) {
    throw new CommandUsageError(`Unexpected argument: ${String(arguments_[0])}`);
  }
}

function showStylesHelp(): void {
  process.stdout.write(`Usage: viewpress styles <command>

Commands:
  list  List generation styles and image models

Run 'viewpress styles list --help' for full options.
`);
}

function showStylesListHelp(): void {
  process.stdout.write('Usage: viewpress styles list [--json]\n');
}
