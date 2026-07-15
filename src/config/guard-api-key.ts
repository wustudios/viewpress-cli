export function guardApiKey(apiKey: string): void {
  if (!/^vp_[A-Za-z0-9_-]+$/.test(apiKey)) {
    throw new Error('Viewpress API keys start with vp_.');
  }
}
