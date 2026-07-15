import type { BrowserLoginSession, FetchRequest } from './browser-login-session.ts';
import { guardApiKey } from '../config/guard-api-key.ts';

interface PollBrowserLoginOptions {
  apiUrl: string;
  fetchRequest: FetchRequest;
  session: BrowserLoginSession;
  wait: (delayMs: number) => Promise<void>;
  getTimeMs: () => number;
  requestTimeoutMs: number;
}

export async function pollBrowserLoginSession(options: PollBrowserLoginOptions): Promise<string> {
  while (getRemainingSessionMs(options) > 0) {
    const intervalMs = options.session.intervalSec * 1_000;
    await options.wait(Math.min(intervalMs, getRemainingSessionMs(options)));
    guardSessionActive(options);
    const response = await pollOnce(options);

    if (response === null) {
      continue;
    }

    return response;
  }

  throw new Error('Browser login expired. Start it again.');
}

async function pollOnce(options: PollBrowserLoginOptions): Promise<string | null> {
  const endpoint = getPollEndpoint(options.apiUrl, options.session.sessionId);
  guardSessionActive(options);
  const requestTimeoutMs = Math.min(options.requestTimeoutMs, getRemainingSessionMs(options));
  const response = await options.fetchRequest(endpoint, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${options.session.pollToken}`,
      'Cache-Control': 'no-store',
    },
    method: 'POST',
    signal: AbortSignal.timeout(Math.max(1, Math.ceil(requestTimeoutMs))),
  });

  if (response.status === 202) {
    return null;
  }

  const value: unknown = await response.json();
  return getApprovedApiKey(value, response.status);
}

function getRemainingSessionMs(options: PollBrowserLoginOptions): number {
  return Math.max(0, options.session.expiresAtMs - options.getTimeMs());
}

function guardSessionActive(options: PollBrowserLoginOptions): void {
  if (getRemainingSessionMs(options) === 0) {
    throw new Error('Browser login expired. Start it again.');
  }
}

function getPollEndpoint(apiUrl: string, sessionId: string): string {
  const origin = new URL(apiUrl).origin;
  return `${origin}/api/cli/auth/sessions/${encodeURIComponent(sessionId)}/poll`;
}

function getApprovedApiKey(value: unknown, statusCode: number): string {
  if (!isRecord(value) || typeof value.status !== 'string') {
    throw new Error(`Browser login failed. The server returned ${String(statusCode)}.`);
  }

  if (value.status === 'denied') {
    throw new Error('Browser login was denied.');
  }

  if (value.status === 'expired') {
    throw new Error('Browser login expired. Start it again.');
  }

  if (statusCode !== 200 || value.status !== 'approved' || typeof value.api_key !== 'string') {
    throw new Error(`Browser login failed. The server returned ${String(statusCode)}.`);
  }

  guardApiKey(value.api_key);
  return value.api_key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
