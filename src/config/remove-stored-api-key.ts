import { findStoredConfig } from './find-stored-config.ts';
import { writeStoredConfig } from './write-stored-config.ts';

export async function removeStoredApiKey(): Promise<void> {
  const storedConfig = await findStoredConfig();

  if (!storedConfig?.api_key) {
    return;
  }

  await writeStoredConfig({ api_url: storedConfig.api_url });
}
