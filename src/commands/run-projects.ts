import { z } from 'zod';

import { getApiResponse } from '../api/get-api-response.ts';
import { writeJson } from '../output/write-json.ts';
import { writeError } from '../output/write-error.ts';
import { CommandUsageError } from './command-usage-error.ts';

const projectsResponseSchema = z.object({
  projects: z.array(z.object({ id: z.string(), name: z.string(), createdAt: z.number() })),
});
const projectResponseSchema = z.object({ id: z.string(), name: z.string() });
const projectNameSchema = z.string().min(1).max(120);

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

    if (command === undefined) {
      showProjectsHelp();
      return 0;
    }

    if ((command === '--help' || command === '-h') && arguments_.length === 1) {
      showProjectsHelp();
      return 0;
    }

    throw new CommandUsageError(`Unknown projects command: ${command}`);
  } catch (error) {
    return writeError(error, 'Projects command failed.');
  }
}

async function listProjects(arguments_: string[]): Promise<void> {
  const json = getJsonOption(arguments_);
  const response = await getApiResponse({
    method: 'GET',
    path: 'projects',
    schema: projectsResponseSchema,
  });

  if (json) {
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

  if (options.json) {
    writeJson(response);
    return;
  }

  process.stdout.write(`Created project ${response.name} (${response.id}).\n`);
}

function getCreateProjectOptions(arguments_: string[]): { json: boolean; name: string } {
  let json = false;
  let name: string | undefined;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === '--json' && !json) {
      json = true;
      continue;
    }

    if (argument === '--name' && name === undefined) {
      name = getOptionValue(arguments_, index, '--name');
      index += 1;
      continue;
    }

    throw new CommandUsageError(`Unknown or repeated projects create option: ${String(argument)}`);
  }

  const parsedName = projectNameSchema.safeParse(name);

  if (!parsedName.success) {
    throw new CommandUsageError('Projects create requires --name with 1 to 120 characters.');
  }

  return { json, name: parsedName.data };
}

function getOptionValue(arguments_: string[], index: number, optionName: string): string {
  const value = arguments_[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw new CommandUsageError(`${optionName} requires a value.`);
  }

  return value;
}

function getJsonOption(arguments_: string[]): boolean {
  if (arguments_.length === 0) {
    return false;
  }

  if (arguments_.length === 1 && arguments_[0] === '--json') {
    return true;
  }

  throw new CommandUsageError(`Unknown projects list option: ${String(arguments_[0])}`);
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
