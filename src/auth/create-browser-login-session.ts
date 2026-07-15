import type { BrowserLoginSession, FetchRequest } from './browser-login-session.ts';

export async function createBrowserLoginSession(
  apiUrl: string,
  fetchRequest: FetchRequest,
): Promise<BrowserLoginSession> {
  const endpoint = `${new URL(apiUrl).origin}/api/cli/auth/sessions`;
  const response = await fetchRequest(endpoint, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    method: 'POST',
  });

  if (response.status === 404 || response.status === 405 || response.status === 501) {
    throw new Error(
      `Browser login needs server support at POST /api/cli/auth/sessions. The server returned ${String(response.status)}.`,
    );
  }

  if (!response.ok) {
    throw new Error(`Could not start browser login. The server returned ${String(response.status)}.`);
  }

  return parseSession(await response.json(), apiUrl);
}

function parseSession(value: unknown, apiUrl: string): BrowserLoginSession {
  if (!isRecord(value)) {
    throw new Error('The browser login response is invalid.');
  }

  const sessionId = getString(value, 'session_id');
  const pollToken = getString(value, 'poll_token');
  const verificationUrl = getString(value, 'verification_url');
  const expiresAt = getString(value, 'expires_at');
  const intervalSec = value.interval_sec;
  const expiresAtMs = Date.parse(expiresAt);

  if (!Number.isFinite(expiresAtMs) || typeof intervalSec !== 'number' || intervalSec < 1) {
    throw new Error('The browser login response is invalid.');
  }

  const verificationUrlObject = new URL(verificationUrl);

  guardVerificationUrl(verificationUrlObject, new URL(apiUrl));
  if (sessionId.includes(pollToken) || getDecodedUrl(verificationUrlObject).includes(pollToken)) {
    throw new Error('The browser login URL must not contain the polling token.');
  }

  return { expiresAtMs, intervalSec, pollToken, sessionId, verificationUrl };
}

function guardVerificationUrl(verificationUrl: URL, apiUrl: URL): void {
  const isLoopback = apiUrl.hostname === 'localhost' || apiUrl.hostname === '127.0.0.1';
  const isAllowedProtocol = verificationUrl.protocol === 'https:' || (isLoopback && apiUrl.protocol === 'http:');

  if (!isAllowedProtocol || verificationUrl.origin !== apiUrl.origin) {
    throw new Error('The browser login URL must use the configured Viewpress server.');
  }
}

function getDecodedUrl(url: URL): string {
  try {
    return decodeURIComponent(url.href);
  } catch {
    throw new Error('The browser login response is invalid.');
  }
}

function getString(value: Record<string, unknown>, key: string): string {
  const found = value[key];

  if (typeof found !== 'string' || found.length === 0) {
    throw new Error('The browser login response is invalid.');
  }

  return found;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
