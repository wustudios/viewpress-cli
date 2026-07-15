#!/usr/bin/env bun

import packageJson from '../package.json' with { type: 'json' };
import { runAuth } from './commands/run-auth.ts';
import { showHelp } from './commands/show-help.ts';
import { showVersion } from './commands/show-version.ts';

const arguments_ = Bun.argv.slice(2);
const command = arguments_[0];

if (command === '--version' || command === '-V') {
  showVersion(packageJson.version);
} else if (command === 'auth') {
  process.exitCode = await runAuth(arguments_.slice(1));
} else {
  showHelp();
}
