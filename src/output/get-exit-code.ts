import { CliError } from '../cli/cli-error.ts';
import { CommandUsageError } from '../commands/command-usage-error.ts';

export function getExitCode(error: unknown): number {
  if (error instanceof CliError) {
    return error.exitCode;
  }

  if (error instanceof CommandUsageError) {
    return 2;
  }

  if (isFileError(error)) {
    return 6;
  }

  if (error instanceof TypeError && isTransportMessage(error.message)) {
    return 5;
  }

  return 1;
}

function isFileError(error: unknown): boolean {
  if (!(error instanceof Error) || !('code' in error) || typeof error.code !== 'string') {
    return false;
  }

  return ['EACCES', 'EEXIST', 'EISDIR', 'ENOENT', 'ENOSPC', 'ENOTDIR', 'EPERM', 'EROFS'].includes(error.code);
}

function isTransportMessage(message: string): boolean {
  return /fetch|connect|connection|dns|network|socket|tls/i.test(message);
}
