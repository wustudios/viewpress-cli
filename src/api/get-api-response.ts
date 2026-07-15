import type { z } from 'zod';

import { getConfig } from '../config/get-config.ts';

interface GetApiResponseArguments<ResponseData> {
  body?: unknown;
  fetchRequest?: typeof fetch;
  method: 'DELETE' | 'GET' | 'POST';
  path: string;
  query?: URLSearchParams;
  schema: z.ZodType<ResponseData>;
}

export async function getApiResponse<ResponseData>(
  arguments_: GetApiResponseArguments<ResponseData>,
): Promise<ResponseData> {
  const config = await getConfig();

  if (!config.apiKey) {
    throw new Error('Sign in with `viewpress auth login` or set VIEWPRESS_API_KEY.');
  }

  const url = getRequestUrl(config.apiUrl, arguments_.path, arguments_.query);
  const response = await sendRequest(arguments_, url, config.apiKey);
  const value = await getResponseValue(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(value, response.status));
  }

  const parsed = arguments_.schema.safeParse(value);

  if (!parsed.success) {
    throw new Error(`Viewpress returned an invalid response for ${arguments_.method} ${arguments_.path}.`);
  }

  return parsed.data;
}

function getRequestUrl(apiUrl: string, path: string, query: URLSearchParams | undefined): URL {
  const url = new URL(path.replace(/^\//, ''), `${apiUrl}/`);

  if (query) {
    url.search = query.toString();
  }

  return url;
}

async function sendRequest<ResponseData>(
  arguments_: GetApiResponseArguments<ResponseData>,
  url: URL,
  apiKey: string,
): Promise<Response> {
  const fetchRequest = arguments_.fetchRequest ?? fetch;
  const headers = { Accept: 'application/json', Authorization: `Bearer ${apiKey}` };

  if (arguments_.body === undefined) {
    return fetchRequest(url, { headers, method: arguments_.method });
  }

  return fetchRequest(url, {
    body: JSON.stringify(arguments_.body),
    headers: { ...headers, 'Content-Type': 'application/json' },
    method: arguments_.method,
  });
}

async function getResponseValue(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  try {
    return await response.json();
  } catch {
    throw new Error(`Viewpress returned a non-JSON response with status ${String(response.status)}.`);
  }
}

function getErrorMessage(value: unknown, statusCode: number): string {
  if (isRecord(value) && typeof value.message === 'string' && value.message.length > 0) {
    return value.message;
  }

  return `Viewpress returned status ${String(statusCode)}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
