import { getApiUrl } from '../config/get-api-url.ts';
import { CommandUsageError } from '../commands/command-usage-error.ts';

interface ParsedGlobalArguments {
  arguments: string[];
  options: {
    apiUrl?: string;
    json: boolean;
    nonInteractive: boolean;
    timeoutSec: number;
  };
  version: boolean;
}

export function parseGlobalArguments(arguments_: string[]): ParsedGlobalArguments {
  const remainingArguments: string[] = [];
  const seen = new Set<string>();
  let apiUrl: string | undefined;
  let help = false;
  let json = false;
  let nonInteractive = false;
  let timeout: string | undefined;
  let version = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === '--help' || argument === '-h') {
      guardNewGlobal(seen, '--help');
      help = true;
      continue;
    }

    if (argument === '--version' || argument === '-V') {
      guardNewGlobal(seen, '--version');
      version = true;
      continue;
    }

    if (argument === '--json' || argument === '--non-interactive') {
      guardNewGlobal(seen, argument);
      json = json || argument === '--json';
      nonInteractive = nonInteractive || argument === '--non-interactive';
      continue;
    }

    if (argument === '--api-url' || argument === '--timeout') {
      guardNewGlobal(seen, argument);
      const value = getGlobalValue(arguments_, index, argument);
      index += 1;
      if (argument === '--api-url') {
        apiUrl = parseApiUrl(value);
      } else {
        timeout = value;
      }
      continue;
    }

    remainingArguments.push(String(argument));
  }

  const timeoutSec = getTimeoutSec(timeout ?? process.env.VIEWPRESS_TIMEOUT ?? '30');
  return {
    arguments: getCommandArguments(remainingArguments, json, help),
    options: {
      ...(apiUrl === undefined ? {} : { apiUrl }),
      json,
      nonInteractive: nonInteractive || json,
      timeoutSec,
    },
    version,
  };
}

function getCommandArguments(arguments_: string[], json: boolean, help: boolean): string[] {
  if (help) {
    return [...arguments_, '--help'];
  }

  return addJsonArgument(arguments_, json);
}

function addJsonArgument(arguments_: string[], json: boolean): string[] {
  const command = arguments_[0];
  if (!json || command === undefined || command === 'auth') {
    return arguments_;
  }

  return [...arguments_, '--json'];
}

function guardNewGlobal(seen: Set<string>, option: string): void {
  if (seen.has(option)) {
    throw new CommandUsageError(`Global option ${option} cannot be repeated.`);
  }

  seen.add(option);
}

function getGlobalValue(arguments_: string[], index: number, option: string): string {
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new CommandUsageError(`${option} requires a value.`);
  }

  return value;
}

function parseApiUrl(value: string): string {
  try {
    return getApiUrl(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The Viewpress API URL is invalid.';
    throw new CommandUsageError(message);
  }
}

function getTimeoutSec(value: string): number {
  const timeoutSec = Number(value);
  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) {
    throw new CommandUsageError('Request timeout must be a positive number of seconds.');
  }

  return timeoutSec;
}
