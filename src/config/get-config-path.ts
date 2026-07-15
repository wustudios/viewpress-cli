import { join } from 'node:path';

import { getConfigDirectory } from './get-config-directory.ts';

export function getConfigPath(): string {
  return join(getConfigDirectory(), 'config.json');
}
