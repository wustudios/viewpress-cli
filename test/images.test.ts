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
  test('generates an image with explicit server defaults', async () => {
    const result = await runCli([
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
    const request = requests.at(-1);

    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: '{"assetId":"asset-generated","status":"pending"}\n',
    });
    expect(request?.method).toBe('POST');
    expect(request?.url.pathname).toBe('/api/v1/images/generations');
    expect(request?.body).toEqual({
      aspect_ratio: '9:16',
      model: 'I-PRO',
      name: 'Poster',
      prompt: 'A paper collage',
      video_id: 'video-1',
    });
  });

  test('edits from repeated references and a prompt file', async () => {
    const promptPath = join(configDirectory, 'edit-prompt.txt');
    await writeFile(promptPath, 'Keep the subject and add fog', 'utf8');
    const result = await runCli([
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
    const request = requests.at(-1);

    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: 'Started image asset asset-edited (pending).\n',
    });
    expect(request?.method).toBe('POST');
    expect(request?.url.pathname).toBe('/api/v1/images/edits');
    expect(request?.body).toEqual({
      aspect_ratio: '4:5',
      name: 'Fog edit',
      prompt: 'Keep the subject and add fog',
      reference_asset_ids: ['asset-1', 'asset-2'],
      video_id: 'video-1',
    });
  });

  test('reads stdin only through an explicit prompt file dash', async () => {
    const result = await runCli(
      [
        'images',
        'generate',
        '--video-id',
        'video-2',
        '--name',
        'Landscape',
        '--prompt-file',
        '-',
        '--aspect-ratio',
        '16:9',
        '--model',
        'I-REALISTIC',
      ],
      'A wide mountain landscape',
    );
    const request = requests.at(-1);

    expect(result.exitCode).toBe(0);
    expect(request?.body).toEqual({
      aspect_ratio: '16:9',
      model: 'I-REALISTIC',
      name: 'Landscape',
      prompt: 'A wide mountain landscape',
      video_id: 'video-2',
    });
  });

  test('rejects invalid and conflicting options before fetch', async () => {
    const requestCount = requests.length;
    const shortPrompt = await runCli([
      'images',
      'generate',
      '--video-id',
      'video-1',
      '--name',
      'Short',
      '--prompt',
      'no',
    ]);
    const noReferences = await runCli([
      'images',
      'edit',
      '--video-id',
      'video-1',
      '--name',
      'No refs',
      '--prompt',
      'Enough words',
    ]);
    const conflictingPrompt = await runCli([
      'images',
      'generate',
      '--video-id',
      'video-1',
      '--name',
      'Conflict',
      '--prompt',
      'Inline prompt',
      '--prompt-file',
      '-',
    ]);
    const invalidModel = await runCli([
      'images',
      'generate',
      '--video-id',
      'video-1',
      '--name',
      'Bad model',
      '--prompt',
      'Enough words',
      '--model',
      'unknown',
    ]);

    expect(shortPrompt.exitCode).toBe(2);
    expect(shortPrompt.stderr).toContain('at least 3 characters');
    expect(noReferences.exitCode).toBe(2);
    expect(noReferences.stderr).toContain('1 to 6 --reference-asset-id');
    expect(conflictingPrompt.exitCode).toBe(2);
    expect(conflictingPrompt.stderr).toContain('conflicting images option');
    expect(invalidModel.exitCode).toBe(2);
    expect(invalidModel.stderr).toContain('I-FAST, I-PRO, or I-REALISTIC');
    expect(requests).toHaveLength(requestCount);
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
