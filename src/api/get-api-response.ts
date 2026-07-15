import type { z } from 'zod';

import { CliError } from '../cli/cli-error.ts';
import { getRuntimeOptions } from '../cli/runtime-options.ts';
import { getConfig } from '../config/get-config.ts';

interface GetApiResponseArguments<ResponseData> {
  body?: unknown;
  fetchRequest?: typeof fetch;
  method: 'DELETE' | 'GET' | 'POST';
  path: string;
  query?: URLSearchParams;
  schema: z.ZodType<ResponseData>;
  timeoutMs?: number;
}

export async function getApiResponse<ResponseData>(
  arguments_: GetApiResponseArguments<ResponseData>,
): Promise<ResponseData> {
  const config = await getConfig();

  if (!config.apiKey) {
    throw new CliError({
      exitCode: 3,
      message: 'Sign in with `viewpress auth login` or set VIEWPRESS_API_KEY.',
      type: 'authentication_error',
    });
  }

  const url = getRequestUrl(config.apiUrl, arguments_.path, arguments_.query);
  const response = await sendRequest(arguments_, url, config.apiKey);
  const value = await getResponseValue(response, arguments_);

  if (!response.ok) {
    throw getApiError(value, response.status);
  }

  const parsed = arguments_.schema.safeParse(value);
  if (!parsed.success) {
    throw new CliError({
      exitCode: 1,
      message: `Viewpress returned an invalid response for ${arguments_.method} ${arguments_.path}.`,
      type: 'invalid_response',
    });
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
  const timeoutMs = Math.min(
    getRuntimeOptions().timeoutSec * 1_000,
    arguments_.timeoutMs ?? Number.POSITIVE_INFINITY,
  );
  const timeoutSignal = AbortSignal.timeout(timeoutMs);

  try {
    if (arguments_.body === undefined) {
      return await fetchRequest(url, { headers, method: arguments_.method, signal: timeoutSignal });
    }

    return await fetchRequest(url, {
      body: JSON.stringify(arguments_.body),
      headers: { ...headers, 'Content-Type': 'application/json' },
      method: arguments_.method,
      signal: timeoutSignal,
    });
  } catch (error) {
    if (timeoutSignal.aborted) {
      throw new CliError({
        exitCode: 4,
        message: `Request timed out after ${String(timeoutMs / 1_000)} seconds.`,
        type: 'timeout_error',
      });
    }

    const message = error instanceof Error ? error.message : 'Could not connect to Viewpress.';
    throw new CliError({ exitCode: 5, message, type: 'transport_error' });
  }
}

async function getResponseValue<ResponseData>(
  response: Response,
  arguments_: GetApiResponseArguments<ResponseData>,
): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  try {
    return await response.json();
  } catch {
    throw new CliError({
      exitCode: response.status === 401 || response.status === 403 ? 3 : 1,
      message: `Viewpress returned a non-JSON response for ${arguments_.method} ${arguments_.path} with status ${String(response.status)}.`,
      status: response.status,
      type: 'invalid_response',
    });
  }
}

function getApiError(value: unknown, status: number): CliError {
  if (!isRecord(value)) {
    return new CliError({
      exitCode: status === 401 || status === 403 ? 3 : 1,
      message: `Viewpress returned status ${String(status)}.`,
      status,
      type: 'api_error',
    });
  }

  const type = typeof value.type === 'string' && value.type.length > 0 ? value.type : 'api_error';
  const message = typeof value.message === 'string' && value.message.length > 0
    ? value.message
    : `Viewpress returned status ${String(status)}.`;
  const details = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'message' && key !== 'type'));

  return new CliError({
    ...(Object.keys(details).length === 0 ? {} : { details }),
    exitCode: status === 401 || status === 403 ? 3 : 1,
    message,
    status,
    type,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
