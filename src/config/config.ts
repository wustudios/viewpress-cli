export interface Config {
  apiUrl: string;
  apiKey: string | null;
  apiKeySource: 'environment' | 'file' | null;
}
