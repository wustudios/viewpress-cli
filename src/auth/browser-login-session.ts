export interface BrowserLoginSession {
  sessionId: string;
  pollToken: string;
  verificationUrl: string;
  expiresAtMs: number;
  intervalSec: number;
}

export type FetchRequest = (
  input: Request | string | URL,
  init?: RequestInit,
) => Promise<Response>;
