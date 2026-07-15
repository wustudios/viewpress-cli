import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface RecordedRequest {
  authorization: string | null;
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
  configDirectory = await mkdtemp(join(tmpdir(), 'viewpress-cli-render-import-'));
  server = Bun.serve({ fetch: handleRequest, hostname: '127.0.0.1', port: 0 });
});

afterAll(async () => {
  await server.stop(true);
  await rm(configDirectory, { force: true, recursive: true });
});

describe('render and media import commands', () => {
  test('creates a render from a JSON file and preserves timeline fields', async () => {
    const timelinePath = join(configDirectory, 'timeline.json');
    const timeline = {
      backgroundColor: '#101010',
      durationInFrames: 180,
      fps: 30,
      metadata: { version: 2 },
      tracks: [{ clips: [{ assetId: 'image-1', durationInFrames: 180 }] }],
    };
    await writeFile(timelinePath, JSON.stringify(timeline), 'utf8');
    const result = await runCli([
      'renders',
      'create',
      '--video-id',
      'video-1',
      '--name',
      'Launch cut',
      '--timeline',
      timelinePath,
      '--json',
    ]);
    const request = requests.at(-1);

    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: '{"assetId":"asset-render","status":"pending"}\n',
    });
    expect(request).toMatchObject({
      authorization: 'Bearer vp_test_key',
      body: { name: 'Launch cut', timeline, video_id: 'video-1' },
      method: 'POST',
    });
    expect(request?.url.pathname).toBe('/api/v1/renders');
  });

  test('creates a render from explicit stdin JSON', async () => {
    const timeline = { durationInFrames: 24, tracks: [{ clips: [] }] };
    const result = await runCli(
      ['renders', 'create', '--video-id', 'video-2', '--name', 'One second', '--timeline', '-'],
      JSON.stringify(timeline),
    );
    const request = requests.at(-1);

    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: 'Started render asset asset-render (pending).\n',
    });
    expect(request?.body).toEqual({ name: 'One second', timeline, video_id: 'video-2' });
  });

  test('imports a public HTTPS URL with an optional name', async () => {
    const result = await runCli([
      'media',
      'import',
      '--video-id',
      'video-3',
      '--url',
      'https://cdn.example.com/media/intro.mp4',
      '--name',
      'Intro',
      '--json',
    ]);
    const request = requests.at(-1);

    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: '{"assetId":"asset-imported","kind":"video","mimeType":"video/mp4","status":"ready"}\n',
    });
    expect(request).toMatchObject({
      authorization: 'Bearer vp_test_key',
      body: {
        name: 'Intro',
        url: 'https://cdn.example.com/media/intro.mp4',
        video_id: 'video-3',
      },
      method: 'POST',
    });
    expect(request?.url.pathname).toBe('/api/v1/media/imports');
  });

  test('omits an absent import name and writes human output', async () => {
    const result = await runCli([
      'media',
      'import',
      '--video-id',
      'video-4',
      '--url',
      'https://assets.example.com/photo.jpg',
    ]);

    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: 'Imported video asset asset-imported (video/mp4).\n',
    });
    expect(requests.at(-1)?.body).toEqual({
      url: 'https://assets.example.com/photo.jpg',
      video_id: 'video-4',
    });
  });

  test('rejects invalid render inputs before fetch', async () => {
    const requestCount = requests.length;
    const timelinePath = join(configDirectory, 'invalid-timeline.json');
    await writeFile(timelinePath, JSON.stringify({ durationInFrames: 0, tracks: [] }), 'utf8');
    const results = await Promise.all([
      runCli(['renders', 'create', '--name', 'Missing video', '--timeline', timelinePath]),
      runCli(['renders', 'create', '--video-id', 'video', '--timeline', timelinePath]),
      runCli(['renders', 'create', '--video-id', 'video', '--name', 'Missing timeline']),
      runCli(['renders', 'create', '--video-id', 'video', '--name', 'Bad JSON', '--timeline', '-'], '{'),
      runCli(['renders', 'create', '--video-id', 'video', '--name', 'Bad shape', '--timeline', timelinePath]),
      runCli([
        'renders', 'create', '--video-id', 'video', '--video-id', 'again', '--name', 'Repeat',
        '--timeline', timelinePath,
      ]),
      runCli(['renders', 'create', '--video-id', 'video', '--name', 'Unknown', '--timeline', timelinePath, '--wat']),
    ]);

    expect(results.every((result) => result.exitCode === 2)).toBe(true);
    expect(results[0].stderr).toContain('requires --video-id');
    expect(results[1].stderr).toContain('requires --name');
    expect(results[2].stderr).toContain('requires --timeline');
    expect(results[3].stderr).toContain('valid JSON');
    expect(results[4].stderr).toContain('positive integer durationInFrames');
    expect(results[5].stderr).toContain('repeated renders option');
    expect(results[6].stderr).toContain('Unknown');
    expect(requests).toHaveLength(requestCount);
  });

  test('rejects invalid import inputs before fetch', async () => {
    const requestCount = requests.length;
    const results = await Promise.all([
      runCli(['media', 'import', '--url', 'https://cdn.example.com/a.mp4']),
      runCli(['media', 'import', '--video-id', 'video']),
      runCli(['media', 'import', '--video-id', 'video', '--url', 'http://cdn.example.com/a.mp4']),
      runCli(['media', 'import', '--video-id', 'video', '--url', 'https://localhost/a.mp4']),
      runCli(['media', 'import', '--video-id', 'video', '--url', 'https://192.168.1.4/a.mp4']),
      runCli(['media', 'import', '--video-id', 'video', '--url', 'https://cdn.example.com/a.mp4', '--name', '']),
      runCli([
        'media', 'import', '--video-id', 'video', '--url', 'https://cdn.example.com/a.mp4',
        '--url', 'https://cdn.example.com/b.mp4',
      ]),
      runCli(['media', 'import', '--video-id', 'video', '--url', 'https://cdn.example.com/a.mp4', '--wat']),
    ]);

    expect(results.every((result) => result.exitCode === 2)).toBe(true);
    expect(results[0].stderr).toContain('requires --video-id');
    expect(results[1].stderr).toContain('requires --url');
    expect(results[2].stderr).toContain('public HTTPS URL');
    expect(results[3].stderr).toContain('public HTTPS URL');
    expect(results[4].stderr).toContain('public HTTPS URL');
    expect(results[5].stderr).toContain('1 to 120 characters');
    expect(results[6].stderr).toContain('repeated media option');
    expect(results[7].stderr).toContain('Unknown');
    expect(requests).toHaveLength(requestCount);
  });

  test('shows resource and command help without authentication', async () => {
    const results = await Promise.all([
      runCli(['renders', '--help'], undefined, false),
      runCli(['renders', 'create', '--help'], undefined, false),
      runCli(['media', '--help'], undefined, false),
      runCli(['media', 'import', '--help'], undefined, false),
    ]);

    expect(results.every((result) => result.exitCode === 0 && result.stderr === '')).toBe(true);
    expect(results[0].stdout).toContain('Usage: viewpress renders');
    expect(results[1].stdout).toContain('Usage: viewpress renders create');
    expect(results[2].stdout).toContain('Usage: viewpress media');
    expect(results[3].stdout).toContain('Usage: viewpress media import');
  });
});

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const body = await request.json();
  requests.push({
    authorization: request.headers.get('Authorization'),
    body,
    method: request.method,
    url,
  });

  if (url.pathname === '/api/v1/renders' && request.method === 'POST') {
    return Response.json({ assetId: 'asset-render', status: 'pending' });
  }

  if (url.pathname === '/api/v1/media/imports' && request.method === 'POST') {
    return Response.json({ assetId: 'asset-imported', kind: 'video', mimeType: 'video/mp4', status: 'ready' });
  }

  return Response.json({ message: 'Not found' }, { status: 404 });
}

async function runCli(arguments_: string[], stdin?: string, authenticated = true): Promise<CliResult> {
  const childProcess = Bun.spawn(['bun', 'run', 'src/cli.ts', ...arguments_], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      VIEWPRESS_API_KEY: authenticated ? 'vp_test_key' : undefined,
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
