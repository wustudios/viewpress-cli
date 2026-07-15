#!/usr/bin/env bun

import packageJson from '../package.json' with { type: 'json' };
import { runAuth } from './commands/run-auth.ts';
import { runCredits } from './commands/run-credits.ts';
import { runProjects } from './commands/run-projects.ts';
import { runStyles } from './commands/run-styles.ts';
import { runVideos } from './commands/run-videos.ts';
import { runVoices } from './commands/run-voices.ts';
import { showHelp } from './commands/show-help.ts';
import { showVersion } from './commands/show-version.ts';

const arguments_ = Bun.argv.slice(2);
process.exitCode = await runCli(arguments_);

async function runCli(cliArguments: string[]): Promise<number> {
  const command = cliArguments[0];

  if (command === undefined || command === '--help' || command === '-h') {
    return showRootHelp(cliArguments);
  }

  if (command === '--version' || command === '-V') {
    return showRootVersion(cliArguments);
  }

  if (command === 'auth') {
    return runAuth(cliArguments.slice(1));
  }

  if (command === 'projects') {
    return runProjects(cliArguments.slice(1));
  }

  if (command === 'videos') {
    return runVideos(cliArguments.slice(1));
  }

  if (command === 'credits') {
    return runCredits(cliArguments.slice(1));
  }

  if (command === 'styles') {
    return runStyles(cliArguments.slice(1));
  }

  if (command === 'voices') {
    return runVoices(cliArguments.slice(1));
  }

  process.stderr.write(`Error: Unknown command: ${command}\n`);
  return 2;
}

function showRootHelp(cliArguments: string[]): number {
  if (cliArguments.length > 1) {
    process.stderr.write('Error: Help does not accept additional arguments.\n');
    return 2;
  }

  showHelp();
  return 0;
}

function showRootVersion(cliArguments: string[]): number {
  if (cliArguments.length > 1) {
    process.stderr.write('Error: Version does not accept additional arguments.\n');
    return 2;
  }

  showVersion(packageJson.version);
  return 0;
}
