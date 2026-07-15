import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { platform } from 'node:process';

export function getConfigDirectory(): string {
  if (process.env.VIEWPRESS_CONFIG_DIR) {
    return resolve(process.env.VIEWPRESS_CONFIG_DIR);
  }

  if (platform === 'win32') {
    return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Viewpress');
  }

  if (platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Viewpress');
  }

  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'viewpress');
}
