import { CliError } from '../cli/cli-error.ts';
import { getRuntimeOptions } from '../cli/runtime-options.ts';
import { CommandUsageError } from '../commands/command-usage-error.ts';
import { getExitCode } from './get-exit-code.ts';

export function writeError(error: unknown, fallbackMessage = 'Command failed.'): number {
  const exitCode = getExitCode(error);
  const message = error instanceof Error ? error.message : fallbackMessage;

  if (getRuntimeOptions().json) {
    const errorValue = getJsonError(error, exitCode, message);
    process.stderr.write(`${JSON.stringify({ ok: false, error: errorValue })}\n`);
    return exitCode;
  }

  process.stderr.write(`Error: ${message}\n`);
  if (error instanceof CliError && error.hint) {
    process.stderr.write(`Hint: ${error.hint}\n`);
  }
  return exitCode;
}

function getJsonError(error: unknown, exitCode: number, message: string): Record<string, unknown> {
  if (error instanceof CliError) {
    return {
      type: error.type,
      message,
      ...(error.status === undefined ? {} : { status: error.status }),
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }

  if (error instanceof CommandUsageError) {
    return { type: 'usage_error', message };
  }

  if (exitCode === 6) {
    return { type: 'file_error', message };
  }

  if (exitCode === 5) {
    return { type: 'transport_error', message };
  }

  return { type: 'unexpected_error', message };
}
