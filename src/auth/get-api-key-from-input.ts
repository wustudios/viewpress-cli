import { guardApiKey } from '../config/guard-api-key.ts';

export async function getApiKeyFromInput(): Promise<string> {
  const environmentApiKey = process.env.VIEWPRESS_API_KEY?.trim();

  if (environmentApiKey) {
    guardApiKey(environmentApiKey);
    return environmentApiKey;
  }

  if (process.stdin.isTTY) {
    throw new Error('Pipe an API key to stdin or set VIEWPRESS_API_KEY. Keys are not accepted in arguments.');
  }

  const apiKey = (await Bun.stdin.text()).trim();
  guardApiKey(apiKey);
  return apiKey;
}
