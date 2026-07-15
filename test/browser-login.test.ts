import { describe, expect, test } from 'bun:test';

import type { FetchRequest } from '../src/auth/browser-login-session.ts';
import { loginWithBrowser } from '../src/auth/login-with-browser.ts';

describe('loginWithBrowser', () => {
  test('keeps the polling token in the authorization header', async () => {
    const requests: { headers: Headers; url: string }[] = [];
    const responses = [
      Response.json({
        expires_at: '2099-01-01T00:00:00.000Z',
        interval_sec: 1,
        poll_token: 'secret-poll-token',
        session_id: 'session-id',
        verification_url: 'https://viewpress.ai/cli/verify?code=ABCD',
      }),
      new Response(null, { status: 202 }),
      Response.json({ api_key: 'vp_approved_key', status: 'approved' }),
    ];
    const fetchRequest = getMockFetch(responses, requests);
    const shownUrls: string[] = [];
    const openedUrls: string[] = [];

    const apiKey = await loginWithBrowser({
      apiUrl: 'https://viewpress.ai/api/v1',
      fetchRequest,
      getTimeMs: () => 0,
      openUrl: (url) => {
        openedUrls.push(url);
        return Promise.resolve();
      },
      showVerificationUrl: (url) => {
        shownUrls.push(url);
      },
      wait: () => Promise.resolve(),
    });

    expect(apiKey).toBe('vp_approved_key');
    expect(shownUrls).toEqual(['https://viewpress.ai/cli/verify?code=ABCD']);
    expect(openedUrls).toEqual(shownUrls);
    expect(requests[0]?.headers.get('Authorization')).toBeNull();
    expect(requests[1]?.headers.get('Authorization')).toBe('Bearer secret-poll-token');
    expect(requests[1]?.url).not.toContain('secret-poll-token');
    expect(requests[2]?.headers.get('Authorization')).toBe('Bearer secret-poll-token');

    const untrustedFetch = getMockFetch(
      [
        Response.json({
          expires_at: '2099-01-01T00:00:00.000Z',
          interval_sec: 1,
          poll_token: 'secret-poll-token',
          session_id: 'session-id',
          verification_url: 'https://example.com/cli/verify?code=ABCD',
        }),
      ],
      [],
    );
    expect(
      loginWithBrowser({
        apiUrl: 'https://viewpress.ai/api/v1',
        fetchRequest: untrustedFetch,
      }),
    ).rejects.toThrow('The browser login URL must use the configured Viewpress server.');
  });
});

function getMockFetch(
  responses: Response[],
  requests: { headers: Headers; url: string }[],
): FetchRequest {
  return (input, init) => {
    const response = responses[requests.length];
    requests.push({ headers: new Headers(init?.headers), url: getRequestUrl(input) });

    if (!response) {
      throw new Error('Unexpected request');
    }

    return Promise.resolve(response);
  };
}

function getRequestUrl(input: Request | string | URL): string {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.href;
  }

  return input.url;
}
