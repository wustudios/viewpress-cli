import { z } from 'zod';

import { getApiResponse } from '../api/get-api-response.ts';
import { getRuntimeOptions } from '../cli/runtime-options.ts';
import { writeJson } from '../output/write-json.ts';
import { writeError } from '../output/write-error.ts';
import { CommandUsageError } from './command-usage-error.ts';

const creditsResponseSchema = z.object({
  total: z.number(),
  available: z.number(),
  held: z.number(),
});

export async function runCredits(arguments_: string[]): Promise<number> {
  try {
    const command = arguments_[0];

    if (command === 'get') {
      if (arguments_.includes('--help')) {
        showCreditsHelp();
        return 0;
      }
      await getCredits(arguments_.slice(1));
      return 0;
    }

    if (command === undefined) {
      showCreditsHelp();
      return 0;
    }

    if ((command === '--help' || command === '-h') && arguments_.length === 1) {
      showCreditsHelp();
      return 0;
    }

    throw new CommandUsageError(`Unknown credits command: ${command}`);
  } catch (error) {
    return writeError(error, 'Credits command failed.');
  }
}

async function getCredits(arguments_: string[]): Promise<void> {
  guardNoArguments(arguments_);
  const response = await getApiResponse({ method: 'GET', path: 'credits', schema: creditsResponseSchema });

  if (getRuntimeOptions().json) {
    writeJson(response);
    return;
  }

  process.stdout.write(
    `Total: ${String(response.total)}\nAvailable: ${String(response.available)}\nHeld: ${String(response.held)}\n`,
  );
}

function guardNoArguments(arguments_: string[]): void {
  if (arguments_.length > 0) {
    throw new CommandUsageError(`Unknown credits get option: ${String(arguments_[0])}`);
  }
}

function showCreditsHelp(): void {
  process.stdout.write('Usage: viewpress credits get [--json]\n');
}
