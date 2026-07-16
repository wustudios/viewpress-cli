import { z } from 'zod';

import { getApiResponse } from '../api/get-api-response.ts';
import { getRuntimeOptions } from '../cli/runtime-options.ts';
import { writeJson } from '../output/write-json.ts';
import { writeError } from '../output/write-error.ts';
import { CommandUsageError } from './command-usage-error.ts';

const projectsResponseSchema = z.object({
  projects: z.array(z.object({ id: z.string(), name: z.string(), createdAt: z.number() })),
});
const projectResponseSchema = z.object({ id: z.string(), name: z.string() });
const projectNameSchema = z.string().min(1).max(120);

interface CreateProjectInput {
  name: string | undefined;
}

export async function runProjects(arguments_: string[]): Promise<number> {
  try {
    const command = arguments_[0];

    if (command === 'list') {
      if (arguments_.includes('--help')) {
        showProjectCommandHelp(command);
        return 0;
      }
      await listProjects(arguments_.slice(1));
      return 0;
    }

    if (command === 'create') {
      if (arguments_.includes('--help')) {
        showProjectCommandHelp(command);
        return 0;
      }
      await createProject(arguments_.slice(1));
      return 0;
    }

    if (command === undefined || (command === '--help' && arguments_.length === 1)) {
      showProjectsHelp();
      return 0;
    }

    throw new CommandUsageError(`Unknown projects command: ${command}`);
  } catch (error) {
    return writeError(error, 'Projects command failed.');
  }
}

async function listProjects(arguments_: string[]): Promise<void> {
  guardNoArguments(arguments_);
  const response = await getApiResponse({
    method: 'GET',
    path: 'projects',
    schema: projectsResponseSchema,
  });

  if (getRuntimeOptions().json) {
    writeJson(response);
    return;
  }

  if (response.projects.length === 0) {
    process.stdout.write('No projects.\n');
    return;
  }

  for (const project of response.projects) {
    process.stdout.write(`${project.id}\t${project.name}\t${new Date(project.createdAt).toISOString()}\n`);
  }
}

async function createProject(arguments_: string[]): Promise<void> {
  const options = getCreateProjectOptions(arguments_);
  const response = await getApiResponse({
    body: { name: options.name },
    method: 'POST',
    path: 'projects',
    schema: projectResponseSchema,
  });

  if (getRuntimeOptions().json) {
    writeJson(response);
    return;
  }

  process.stdout.write(`Created project ${response.name} (${response.id}).\n`);
}

function getCreateProjectOptions(arguments_: string[]): { name: string } {
  const input = getCreateProjectInput(arguments_);
  const parsedName = projectNameSchema.safeParse(input.name);

  if (!parsedName.success) {
    throw new CommandUsageError('Projects create requires --name with 1 to 120 characters.');
  }

  return { name: parsedName.data };
}

function getCreateProjectInput(arguments_: string[]): CreateProjectInput {
  const input: CreateProjectInput = { name: undefined };
  const seen = new Set<string>();

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    const property = getCreateProjectProperty(argument);
    if (!property) {
      throw new CommandUsageError(`Unknown or repeated projects create option: ${String(argument)}`);
    }
    guardNewOption(seen, property, String(argument));
    input[property] = getOptionValue(arguments_, index, String(argument));
    index += 1;
  }

  return input;
}

function getCreateProjectProperty(argument: string | undefined): keyof CreateProjectInput | null {
  if (argument === '--name') {
    return 'name';
  }
  return null;
}

function guardNewOption(seen: Set<string>, property: string, option: string): void {
  if (seen.has(property)) {
    throw new CommandUsageError(`Unknown or repeated projects create option: ${option}`);
  }

  seen.add(property);
}

function getOptionValue(arguments_: string[], index: number, optionName: string): string {
  const value = arguments_[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw new CommandUsageError(`${optionName} requires a value.`);
  }

  return value;
}

function guardNoArguments(arguments_: string[]): void {
  if (arguments_.length > 0) {
    throw new CommandUsageError(`Unknown projects list option: ${String(arguments_[0])}`);
  }
}

function showProjectsHelp(): void {
  process.stdout.write(`Usage: viewpress projects <command>\n\nCommands:\n  list [--json]\n  create --name <name> [--json]\n`);
}

function showProjectCommandHelp(command: 'create' | 'list'): void {
  if (command === 'list') {
    process.stdout.write('Usage: viewpress projects list [--json]\n');
    return;
  }

  process.stdout.write('Usage: viewpress projects create --name <name> [--json]\n');
}
