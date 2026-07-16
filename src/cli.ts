#!/usr/bin/env bun

import packageJson from '../package.json' with { type: 'json' };
import { parseGlobalArguments } from './cli/parse-global-arguments.ts';
import { getRuntimeOptions, setRuntimeOptions } from './cli/runtime-options.ts';
import { runAssets } from './commands/run-assets.ts';
import { runAuth } from './commands/run-auth.ts';
import { runAudio } from './commands/run-audio.ts';
import { runCredits } from './commands/run-credits.ts';
import { runImages } from './commands/run-images.ts';
import { runMedia } from './commands/run-media.ts';
import { runProjects } from './commands/run-projects.ts';
import { runRenders } from './commands/run-renders.ts';
import { runSocial } from './commands/run-social.ts';
import { runStyles } from './commands/run-styles.ts';
import { runVideos } from './commands/run-videos.ts';
import { runVoices } from './commands/run-voices.ts';
import { CommandUsageError } from './commands/command-usage-error.ts';
import { showHelp } from './commands/show-help.ts';
import { showVersion } from './commands/show-version.ts';
import { writeError } from './output/write-error.ts';

const rawArguments = Bun.argv.slice(2);

try {
  const parsed = parseGlobalArguments(rawArguments);
  setRuntimeOptions(parsed.options);
  if (parsed.version) {
    showVersion(packageJson.version);
    process.exitCode = 0;
  } else {
    process.exitCode = await runCli(parsed.arguments);
  }
} catch (error) {
  setRuntimeOptions({ ...getRuntimeOptions(), json: rawArguments.includes('--json') });
  process.exitCode = writeError(error);
}

async function runCli(cliArguments: string[]): Promise<number> {
  const command = cliArguments[0];

  if (command === undefined || command === '--help') {
    return showRootHelp();
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

  if (command === 'images') {
    return runImages(cliArguments.slice(1));
  }

  if (command === 'assets') {
    return runAssets(cliArguments.slice(1));
  }

  if (command === 'renders') {
    return runRenders(cliArguments.slice(1));
  }

  if (command === 'social') {
    return runSocial(cliArguments.slice(1));
  }

  if (command === 'media') {
    return runMedia(cliArguments.slice(1));
  }

  if (command === 'speech' || command === 'music' || command === 'sfx') {
    return runAudio(command, cliArguments.slice(1));
  }

  if (command === 'styles') {
    return runStyles(cliArguments.slice(1));
  }

  if (command === 'voices') {
    return runVoices(cliArguments.slice(1));
  }

  return writeError(new CommandUsageError(`Unknown command: ${command}`));
}

function showRootHelp(): number {
  showHelp();
  return 0;
}
