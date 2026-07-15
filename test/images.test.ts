import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface RecordedRequest {
  body: unknown;
  method: string;
  url: URL;
}

interface CliResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

const requests: RecordedRequest[] = [];
let configDirectory = '';
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  configDirectory = await mkdtemp(join(tmpdir(), 'viewpress-cli-images-'));
  server = Bun.serve({ fetch: handleRequest, hostname: '127.0.0.1', port: 0 });
});

afterAll(async () => {
  await server.stop(true);
  await rm(configDirectory, { force: true, recursive: true });
});

describe('image commands', () => {
  test('generates and edits images through the CLI', async () => {
    const generated = await runCli([
      'images',
      'generate',
      '--video-id',
      'video-1',
      '--name',
      'Poster',
      '--prompt',
      'A paper collage',
      '--json',
    ]);
    const promptPath = join(configDirectory, 'edit-prompt.txt');
    await writeFile(promptPath, 'Keep the subject and add fog', 'utf8');
    const edited = await runCli([
      'images',
      'edit',
      '--video-id',
      'video-1',
      '--name',
      'Fog edit',
      '--prompt-file',
      promptPath,
      '--reference-asset-id',
      'asset-1',
      '--reference-asset-id',
      'asset-2',
      '--aspect-ratio',
      '4:5',
    ]);

    expect(generated).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: '{"assetId":"asset-generated","status":"pending"}\n',
    });
    expect(edited).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: 'Started image asset asset-edited (pending).\n',
    });
    expect(requests[0]).toMatchObject({
      body: {
        aspect_ratio: '9:16',
        model: 'I-PRO',
        name: 'Poster',
        prompt: 'A paper collage',
        video_id: 'video-1',
      },
      method: 'POST',
    });
    expect(requests[0]?.url.pathname).toBe('/api/v1/images/generations');
    expect(requests[1]?.url.pathname).toBe('/api/v1/images/edits');
    expect(requests[1]?.body).toEqual({
      aspect_ratio: '4:5',
      name: 'Fog edit',
      prompt: 'Keep the subject and add fog',
      reference_asset_ids: ['asset-1', 'asset-2'],
      video_id: 'video-1',
    });
  });
});

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const body = await request.json();
  requests.push({ body, method: request.method, url });

  if (url.pathname === '/api/v1/images/generations' && request.method === 'POST') {
    return Response.json({ assetId: 'asset-generated', status: 'pending' });
  }

  if (url.pathname === '/api/v1/images/edits' && request.method === 'POST') {
    return Response.json({ assetId: 'asset-edited', status: 'pending' });
  }

  return Response.json({ message: 'Not found' }, { status: 404 });
}

async function runCli(arguments_: string[], stdin?: string): Promise<CliResult> {
  const childProcess = Bun.spawn(['bun', 'run', 'src/cli.ts', ...arguments_], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      VIEWPRESS_API_KEY: 'vp_test_key',
      VIEWPRESS_API_URL: `${server.url.href}api/v1`,
      VIEWPRESS_CONFIG_DIR: configDirectory,
    },
    stderr: 'pipe',
    stdin: stdin === undefined ? 'ignore' : new Response(stdin),
    stdout: 'pipe',
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    childProcess.exited,
    new Response(childProcess.stderr).text(),
    new Response(childProcess.stdout).text(),
  ]);

  return { exitCode, stderr, stdout };
}
