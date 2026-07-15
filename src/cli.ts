#!/usr/bin/env bun

import packageJson from '../package.json' with { type: 'json' };
import { showHelp } from './commands/show-help.ts';
import { showVersion } from './commands/show-version.ts';

const argument = Bun.argv[2];

if (argument === '--version' || argument === '-V') {
  showVersion(packageJson.version);
} else {
  showHelp();
}
