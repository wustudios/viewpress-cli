import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const documentationFiles = ['README.md', 'docs/api.md', 'docs/commands.md', 'docs/server-contracts.md'];
const rootCommands = [
  'auth', 'projects', 'videos', 'credits', 'styles', 'voices', 'images',
  'assets', 'renders', 'social', 'media', 'speech', 'music', 'sfx',
];
const apiOperations = [
  'GET /projects', 'POST /projects', 'GET /videos', 'POST /videos',
  'GET /credits', 'GET /styles', 'POST /images/generations',
  'POST /images/edits', 'POST /videos/generations',
  'POST /videos/motion-transfers', 'POST /videos/talking-images',
  'POST /videos/ugc-ads', 'POST /videos/timelapse-scenes', 'POST /speech',
  'GET /voices', 'POST /music', 'POST /sfx', 'POST /renders',
  'POST /media/imports', 'GET /assets/{assetId}', 'GET /assets',
  'POST /assets/{assetId}/captions', 'POST /assets/{assetId}/smooth',
  'POST /assets/{assetId}/humanize', 'POST /assets/{assetId}/upscale',
  'POST /assets/{assetId}/remove-background',
  'POST /assets/{assetId}/enhance-audio',
  'POST /assets/{assetId}/transcription', 'GET /social/accounts',
  'POST /social/accounts/connections', 'POST /social/posts',
  'GET /social/posts', 'GET /social/posts/{postId}',
  'DELETE /social/posts/{postId}',
];

const contents = await getDocumentation();
await guardInternalLinks(contents);
guardCommands(contents.get('docs/commands.md') ?? '');
guardApiOperations(contents.get('docs/api.md') ?? '');
process.stdout.write('Documentation check passed.\n');

async function getDocumentation(): Promise<Map<string, string>> {
  const entries = await Promise.all(
    documentationFiles.map(async (file) => [file, await readFile(file, 'utf8')] as const),
  );
  return new Map(entries);
}

async function guardInternalLinks(contents: Map<string, string>): Promise<void> {
  for (const [source, markdown] of contents) {
    const links = markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g);
    for (const match of links) {
      const target = match[1]?.split('#')[0];
      if (!target || /^(?:https?:|mailto:|#)/.test(target)) {
        continue;
      }
      await readFile(resolve(dirname(source), decodeURIComponent(target)));
    }
  }
}

function guardCommands(commands: string): void {
  for (const command of rootCommands) {
    if (!commands.includes(`viewpress ${command}`)) {
      throw new Error(`docs/commands.md is missing root command: ${command}`);
    }
  }
}

function guardApiOperations(api: string): void {
  for (const operation of apiOperations) {
    if (!api.includes(operation)) {
      throw new Error(`docs/api.md is missing API operation: ${operation}`);
    }
  }
}
