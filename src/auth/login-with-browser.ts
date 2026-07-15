import { createBrowserLoginSession } from './create-browser-login-session.ts';
import type { FetchRequest } from './browser-login-session.ts';
import { openBrowser } from './open-browser.ts';
import { pollBrowserLoginSession } from './poll-browser-login-session.ts';

export interface LoginWithBrowserOptions {
  apiUrl: string;
  fetchRequest?: FetchRequest;
  openUrl?: (url: string) => Promise<void>;
  showVerificationUrl?: (url: string) => void;
  wait?: (delayMs: number) => Promise<void>;
  getTimeMs?: () => number;
}

export async function loginWithBrowser(options: LoginWithBrowserOptions): Promise<string> {
  const fetchRequest = options.fetchRequest ?? fetch;
  const session = await createBrowserLoginSession(options.apiUrl, fetchRequest);
  const showVerificationUrl = options.showVerificationUrl ?? showUrl;
  const openUrl = options.openUrl ?? openBrowser;

  showVerificationUrl(session.verificationUrl);
  await openUrl(session.verificationUrl);

  return pollBrowserLoginSession({
    apiUrl: options.apiUrl,
    fetchRequest,
    getTimeMs: options.getTimeMs ?? ((): number => Date.now()),
    session,
    wait: options.wait ?? wait,
  });
}

function showUrl(url: string): void {
  if (!process.stderr.isTTY) {
    return;
  }

  process.stderr.write(`Open this URL to sign in:\n${url}\n`);
}

async function wait(delayMs: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
