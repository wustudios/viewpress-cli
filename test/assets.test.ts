import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

interface RecordedRequest {
  authorization: string | null;
  body: unknown;
  method: string;
  pathname: string;
  search: string;
}

interface CliResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

interface MockAsset {
  createdAt: number;
  durationMs: number;
  error: string | undefined;
  height: number;
  id: string;
  kind: 'video';
  mimeType: string;
  name: string;
  previewUrl: string;
  progress: number;
  status: 'error' | 'ready' | 'running';
  url: string | undefined;
  width: number;
}

const requests: RecordedRequest[] = [];
let configDirectory = '';
let partialDownloadUrl = '';
let partialServer: ReturnType<typeof createServer>;
let server: ReturnType<typeof Bun.serve>;
let waitRequestCount = 0;

beforeAll(async () => {
  configDirectory = await mkdtemp(join(tmpdir(), 'viewpress-cli-assets-'));
  partialServer = createServer((socket) => {
    socket.end('HTTP/1.1 200 OK\r\nContent-Length: 100\r\nConnection: close\r\n\r\npartial');
  });
  await new Promise<void>((resolve, reject) => {
    partialServer.once('error', reject);
    partialServer.listen(0, '127.0.0.1', resolve);
  });
  const partialAddress = partialServer.address();
  if (!partialAddress || typeof partialAddress === 'string') {
    throw new Error('Partial download server did not expose a TCP port.');
  }
  partialDownloadUrl = `http://127.0.0.1:${String(partialAddress.port)}/partial`;
  server = Bun.serve({ fetch: handleRequest, hostname: '127.0.0.1', port: 0 });
});

afterAll(async () => {
  await server.stop(true);
  await new Promise<void>((resolve, reject) => {
    partialServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  await rm(configDirectory, { force: true, recursive: true });
});

describe('asset commands', () => {
  test('lists, gets, and waits for assets through the public asset schema', async () => {
    const list = await runCli(['assets', 'list', '--video-id', 'video-1', '--kind', 'video', '--json']);
    const get = await runCli(['assets', 'get', 'asset-ready']);
    const wait = await runCli([
      'assets', 'wait', 'asset-wait', '--poll-interval', '0.01', '--wait-timeout', '1', '--json',
    ]);

    expect(list).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: `${JSON.stringify({ assets: [getAssetResponse('asset-ready')] })}\n`,
    });
    expect(get).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: `asset-ready\tvideo\tready\tLaunch\t${server.url.href}files/good\n`,
    });
    expect(wait).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: `${JSON.stringify(getAssetResponse('asset-wait'))}\n`,
    });
    expect(requests.find((request) => request.pathname === '/api/v1/assets')?.search)
      .toBe('?limit=50&video_id=video-1&kind=video');
  });

  test('sends the exact transform paths and request bodies', async () => {
    const requestCount = requests.length;
    const commands = [
      ['add-captions', 'asset-source', '--json'],
      ['smooth', 'asset-source', '--json'],
      ['humanize', 'asset-source', '--json'],
      ['upscale', 'asset-source', '--width', '1920', '--height', '1080', '--output-frame-rate', '60', '--json'],
      ['remove-background', 'asset-source', '--no-subject-is-person', '--no-refine-foreground-edges', '--output-codec', 'h264', '--json'],
      ['enhance-audio', 'asset-source', '--no-remove-noise', '--no-normalize', '--no-studio-sound', '--json'],
      ['transcribe', 'asset-source', '--json'],
    ];

    const results = [];
    for (const command of commands) {
      results.push(await runCli(['assets', ...command]));
    }

    expect(results.every((result) => result.exitCode === 0 && result.stderr === '')).toBe(true);
    expect(results.every((result) => result.stdout === '{"assetId":"asset-transformed","status":"pending"}\n'))
      .toBe(true);
    expect(requests.slice(requestCount)).toMatchObject([
      {
        body: {
          preset_id: 'basic', font_size: 80, alignment: 'bottom', karaoke: true, animated: true,
          words_at_a_time: 'short',
        },
        method: 'POST', pathname: '/api/v1/assets/asset-source/captions',
      },
      { body: undefined, method: 'POST', pathname: '/api/v1/assets/asset-source/smooth' },
      { body: undefined, method: 'POST', pathname: '/api/v1/assets/asset-source/humanize' },
      {
        body: { output_resolution: { width: 1920, height: 1080 }, output_frame_rate: 60 },
        method: 'POST', pathname: '/api/v1/assets/asset-source/upscale',
      },
      {
        body: { subject_is_person: false, refine_foreground_edges: false, output_codec: 'h264' },
        method: 'POST', pathname: '/api/v1/assets/asset-source/remove-background',
      },
      {
        body: { remove_noise: false, normalize: false, studio_sound: false },
        method: 'POST', pathname: '/api/v1/assets/asset-source/enhance-audio',
      },
      { body: undefined, method: 'POST', pathname: '/api/v1/assets/asset-source/transcription' },
    ]);
  });

  test('downloads raw stdout and files without forwarding Viewpress authorization', async () => {
    const outputPath = join(configDirectory, 'asset.bin');
    const stdoutDownload = await runCli(['assets', 'download', 'asset-download', '--output', '-']);
    const fileDownload = await runCli(['assets', 'download', 'asset-download', '--output', outputPath]);
    const downloadRequests = requests.filter((request) => request.pathname === '/files/good');

    expect(stdoutDownload).toEqual({ exitCode: 0, stderr: '', stdout: 'asset bytes' });
    expect(fileDownload).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: `Downloaded asset asset-download to ${outputPath}.\n`,
    });
    expect(await readFile(outputPath, 'utf8')).toBe('asset bytes');
    expect(downloadRequests).toHaveLength(2);
    expect(downloadRequests.every((request) => request.authorization === null)).toBe(true);
  });

  test('refuses existing output and removes a partial temporary download', async () => {
    const existingPath = join(configDirectory, 'existing.bin');
    const partialPath = join(configDirectory, 'partial.bin');
    await writeFile(existingPath, 'keep me', 'utf8');
    const existing = await runCli(['assets', 'download', 'asset-download', '--output', existingPath]);
    const partial = await runCli(['assets', 'download', 'asset-partial', '--output', partialPath]);

    expect(existing.exitCode).toBe(2);
    expect(existing.stderr).toContain('already exists');
    expect(await readFile(existingPath, 'utf8')).toBe('keep me');
    expect(partial.exitCode).toBe(1);
    expect(await readdir(configDirectory)).not.toContain('partial.bin');
    expect((await readdir(configDirectory)).some((name) => name.startsWith('.partial.bin.'))).toBe(false);
  });

  test('returns nonzero for terminal wait failures and validates upscale dimensions before fetch', async () => {
    const requestCount = requests.length;
    const terminal = await runCli(['assets', 'wait', 'asset-error', '--poll-interval', '0.01']);
    const invalid = await runCli(['assets', 'upscale', 'asset-source', '--width', '1920']);

    expect(terminal.exitCode).toBe(1);
    expect(terminal.stderr).toContain('ended with status error: render failed');
    expect(invalid.exitCode).toBe(2);
    expect(invalid.stderr).toContain('--width and --height together');
    expect(requests.slice(requestCount).map((request) => request.pathname))
      .toEqual(['/api/v1/assets/asset-error']);
  });
});

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const body = request.headers.get('Content-Type') === 'application/json' ? await request.json() : undefined;
  requests.push({
    authorization: request.headers.get('Authorization'),
    body,
    method: request.method,
    pathname: url.pathname,
    search: url.search,
  });

  if (url.pathname === '/files/good') {
    return new Response('asset bytes');
  }
  if (url.pathname === '/api/v1/assets') {
    return Response.json({ assets: [getAssetResponse('asset-ready')] });
  }
  if (url.pathname.startsWith('/api/v1/assets/') && request.method === 'GET') {
    return Response.json(getAssetForPath(url.pathname));
  }
  if (url.pathname.startsWith('/api/v1/assets/') && request.method === 'POST') {
    return Response.json({ assetId: 'asset-transformed', status: 'pending' });
  }
  return Response.json({ message: 'Not found' }, { status: 404 });
}

function getAssetForPath(pathname: string): ReturnType<typeof getAssetResponse> {
  if (pathname.endsWith('/asset-wait')) {
    waitRequestCount += 1;
    return waitRequestCount === 1
      ? { ...getAssetResponse('asset-wait'), status: 'running', url: undefined, progress: 40 }
      : getAssetResponse('asset-wait');
  }
  if (pathname.endsWith('/asset-error')) {
    return { ...getAssetResponse('asset-error'), status: 'error', url: undefined, error: 'render failed' };
  }
  if (pathname.endsWith('/asset-partial')) {
    return { ...getAssetResponse('asset-partial'), url: partialDownloadUrl };
  }
  return getAssetResponse(pathname.split('/').at(-1) ?? 'asset-ready');
}

function getAssetResponse(id: string): MockAsset {
  return {
    id,
    name: 'Launch',
    kind: 'video',
    status: 'ready',
    url: `${server.url.href}files/good`,
    previewUrl: `${server.url.href}files/preview`,
    mimeType: 'video/mp4',
    width: 1080,
    height: 1920,
    durationMs: 3000,
    progress: 100,
    error: undefined,
    createdAt: 1_700_000_000_000,
  };
}

async function runCli(arguments_: string[]): Promise<CliResult> {
  const childProcess = Bun.spawn(['bun', 'run', 'src/cli.ts', ...arguments_], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      VIEWPRESS_API_KEY: 'vp_test_key',
      VIEWPRESS_API_URL: `${server.url.href}api/v1`,
      VIEWPRESS_CONFIG_DIR: configDirectory,
    },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    childProcess.exited,
    new Response(childProcess.stderr).text(),
    new Response(childProcess.stdout).text(),
  ]);
  return { exitCode, stderr, stdout };
}
