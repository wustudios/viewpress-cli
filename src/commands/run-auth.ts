import { authLogin } from './auth-login.ts';
import { authLogout } from './auth-logout.ts';
import { authSetKey } from './auth-set-key.ts';
import { authStatus } from './auth-status.ts';
import { showAuthHelp } from './show-auth-help.ts';
import { writeError } from '../output/write-error.ts';
import { CommandUsageError } from './command-usage-error.ts';

export async function runAuth(arguments_: string[]): Promise<number> {
  const command = arguments_[0];

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

    if (command === undefined || command === '--help' || command === '-h') {
      showAuthHelp();
      return 0;
    }

    return writeError(new CommandUsageError('Unknown auth command.'));
  } catch (error) {
    return writeError(error, 'Authentication failed.');
  }
}
