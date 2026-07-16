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

interface GlobalInput {
  apiUrl: string | undefined;
  commandArguments: string[];
  help: boolean;
  json: boolean;
  nonInteractive: boolean;
  timeout: string | undefined;
  version: boolean;
}

interface GlobalArgument {
  arguments_: string[];
  index: number;
  input: GlobalInput;
  seen: Set<string>;
}

interface GlobalFlag {
  option: string;
  property: 'help' | 'json' | 'nonInteractive' | 'version';
}

export function parseGlobalArguments(arguments_: string[]): ParsedGlobalArguments {
  const input = getGlobalInput(arguments_);
  return getParsedGlobalArguments(input);
}

function getGlobalInput(arguments_: string[]): GlobalInput {
  const input: GlobalInput = {
    apiUrl: undefined, commandArguments: [], help: false, json: false,
    nonInteractive: false, timeout: undefined, version: false,
  };
  const seen = new Set<string>();
  for (let index = 0; index < arguments_.length; index += 1) {
    index = readGlobalArgument({ arguments_, index, input, seen });
  }
  return input;
}

function readGlobalArgument(values: GlobalArgument): number {
  const { arguments_, index, input, seen } = values;
  const argument = arguments_[index];
  const flag = findGlobalFlag(argument);
  if (flag) {
    guardNewGlobal(seen, flag.option);
    input[flag.property] = true;
    return index;
  }
  if (argument === '--api-url' || argument === '--timeout') {
    return readGlobalValueArgument(values, argument);
  }
  input.commandArguments.push(String(argument));
  return index;
}

function findGlobalFlag(argument: string | undefined): GlobalFlag | null {
  if (argument === '--help' || argument === '-h') {
    return { option: '--help', property: 'help' };
  }
  if (argument === '--version' || argument === '-V') {
    return { option: '--version', property: 'version' };
  }
  if (argument === '--json') {
    return { option: argument, property: 'json' };
  }
  if (argument === '--non-interactive') {
    return { option: argument, property: 'nonInteractive' };
  }
  return null;
}

function readGlobalValueArgument(values: GlobalArgument, argument: '--api-url' | '--timeout'): number {
  const { arguments_, index, input, seen } = values;
  guardNewGlobal(seen, argument);
  const value = getGlobalValue(arguments_, index, argument);
  if (argument === '--api-url') {
    input.apiUrl = parseApiUrl(value);
  } else {
    input.timeout = value;
  }
  return index + 1;
}

function getParsedGlobalArguments(input: GlobalInput): ParsedGlobalArguments {
  const timeoutSec = getTimeoutSec(input.timeout ?? process.env.VIEWPRESS_TIMEOUT ?? '30');
  return {
    arguments: getCommandArguments(input.commandArguments, input.help),
    options: {
      ...(input.apiUrl === undefined ? {} : { apiUrl: input.apiUrl }),
      json: input.json,
      nonInteractive: input.nonInteractive || input.json,
      timeoutSec,
    },
    version: input.version,
  };
}

function getCommandArguments(arguments_: string[], help: boolean): string[] {
  if (help) {
    return [...arguments_, '--help'];
  }

  return arguments_;
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
