import { authLogin } from './auth-login.ts';
import { authLogout } from './auth-logout.ts';
import { authSetKey } from './auth-set-key.ts';
import { authStatus } from './auth-status.ts';
import { showAuthHelp } from './show-auth-help.ts';
import { writeError } from '../output/write-error.ts';
import { CommandUsageError } from './command-usage-error.ts';

export async function runAuth(arguments_: string[]): Promise<number> {
  const command = arguments_[0];

  if (arguments_.includes('--help') && (command === undefined || command === '--help')) {
    showAuthHelp();
    return 0;
  }

  if (
    arguments_.includes('--help') &&
    (command === 'login' || command === 'set-key' || command === 'status' || command === 'logout')
  ) {
    showAuthCommandHelp(command);
    return 0;
  }

  if (arguments_.length > 1) {
    return writeError(new CommandUsageError('Auth commands do not accept additional arguments.'));
  }

  try {
    if (command === 'login') {
      await authLogin();
      return 0;
    }

    if (command === 'set-key') {
      await authSetKey();
      return 0;
    }

    if (command === 'status') {
      return await authStatus();
    }

    if (command === 'logout') {
      await authLogout();
      return 0;
    }

    if (command === undefined || command === '--help') {
      showAuthHelp();
      return 0;
    }

    return writeError(new CommandUsageError('Unknown auth command.'));
  } catch (error) {
    return writeError(error, 'Authentication failed.');
  }
}

function showAuthCommandHelp(command: 'login' | 'logout' | 'set-key' | 'status'): void {
  if (command === 'set-key') {
    process.stdout.write('Usage: viewpress auth set-key\n\nRead a vp_ API key from stdin or VIEWPRESS_API_KEY.\n');
    return;
  }

  process.stdout.write(`Usage: viewpress auth ${command}\n`);
}
