import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
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
  kind: string;
  mimeType: string;
  name: string;
  previewUrl: string;
  progress: number;
  status: string;
  url: string | undefined;
  width: number;
}

const requests: RecordedRequest[] = [];
let configDirectory = '';
let partialDownloadUrl = '';
let partialServer: ReturnType<typeof createServer>;
let server: ReturnType<typeof Bun.serve>;
let timeoutDownloadUrl = '';
let waitRequestCount = 0;

beforeAll(async () => {
  configDirectory = await mkdtemp(join(tmpdir(), 'viewpress-cli-assets-'));
  partialServer = createServer((socket) => {
    socket.once('data', (request) => {
      const response = 'HTTP/1.1 200 OK\r\nContent-Length: 100\r\nConnection: close\r\n\r\npartial';
      if (request.toString().startsWith('GET /timeout ')) {
        socket.write(response);
        return;
      }
      socket.end(response);
    });
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
  timeoutDownloadUrl = `http://127.0.0.1:${String(partialAddress.port)}/timeout`;
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
  test('gets, lists, waits for, and transforms assets through the CLI', async () => {
    const list = await runCli(['assets', 'list', '--video-id', 'video-1', '--kind', 'video', '--json']);
    const get = await runCli(['assets', 'get', 'asset-ready']);
    const wait = await runCli([
      'assets', 'wait', 'asset-wait', '--poll-interval', '0.01', '--wait-timeout', '1', '--json',
    ]);

    expect(list).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: `${JSON.stringify({ ok: true, data: { assets: [getAssetResponse('asset-ready')] } })}\n`,
    });
    expect(get).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: `asset-ready\tslideshow\tready\tLaunch\t${server.url.href}files/good\n`,
    });
    expect(wait).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: `${JSON.stringify({ ok: true, data: getAssetResponse('asset-wait') })}\n`,
    });
    expect(requests.find((request) => request.pathname === '/api/v1/assets')?.search)
      .toBe('?limit=50&video_id=video-1&kind=video');
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
    expect(results.every((result) => result.stdout === '{"ok":true,"data":{"assetId":"asset-transformed","status":"pending"}}\n'))
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
    const credentialPath = join(configDirectory, 'credential.bin');
    const insecurePath = join(configDirectory, 'insecure.bin');
    const malformedPath = join(configDirectory, 'malformed.bin');
    const missingPath = join(configDirectory, 'missing.bin');
    const stdoutDownload = await runCli(['assets', 'download', 'asset-download', '--output', '-']);
    const fileDownload = await runCli(['assets', 'download', 'asset-download', '--output', outputPath]);
    const redirectDownload = await runCli(['assets', 'download', 'asset-redirect', '--output', '-']);
    const credentialRedirect = await runCli(['assets', 'download', 'asset-redirect-credentials', '--output', '-']);
    const credentialFile = await runCli([
      'assets', 'download', 'asset-redirect-credentials', '--output', credentialPath,
    ]);
    const insecureRedirect = await runCli(['assets', 'download', 'asset-redirect-insecure', '--output', '-']);
    const insecureFile = await runCli(['assets', 'download', 'asset-redirect-insecure', '--output', insecurePath]);
    const malformedRedirect = await runCli(['assets', 'download', 'asset-redirect-malformed', '--output', '-']);
    const malformedFile = await runCli(['assets', 'download', 'asset-redirect-malformed', '--output', malformedPath]);
    const redirectLoop = await runCli(['assets', 'download', 'asset-redirect-loop', '--output', '-']);
    const missingRaw = await runCli(['assets', 'download', 'asset-missing', '--output', '-']);
    const missingFile = await runCli(['assets', 'download', 'asset-missing', '--output', missingPath]);
    const downloadRequests = requests.filter((request) => request.pathname === '/files/good');

    expect(stdoutDownload).toEqual({ exitCode: 0, stderr: '', stdout: 'asset bytes' });
    expect(fileDownload).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: `Downloaded asset asset-download to ${outputPath}.\n`,
    });
    expect(redirectDownload).toEqual({ exitCode: 0, stderr: '', stdout: 'asset bytes' });
    expect(credentialRedirect).toEqual({
      exitCode: 1,
      stderr: 'Error: Viewpress returned an asset download URL containing credentials.\n',
      stdout: '',
    });
    expect(credentialFile).toEqual(credentialRedirect);
    expect(insecureRedirect).toEqual({
      exitCode: 1,
      stderr: 'Error: Viewpress returned an insecure asset download URL.\n',
      stdout: '',
    });
    expect(insecureFile).toEqual(insecureRedirect);
    expect(malformedRedirect).toEqual({
      exitCode: 1,
      stderr: 'Error: Viewpress returned an invalid asset download URL.\n',
      stdout: '',
    });
    expect(malformedFile).toEqual(malformedRedirect);
    expect(redirectLoop).toEqual({
      exitCode: 1,
      stderr: 'Error: Asset download exceeded 5 redirects.\n',
      stdout: '',
    });
    expect(missingRaw).toEqual({
      exitCode: 1,
      stderr: 'Error: Asset download returned status 404.\n',
      stdout: '',
    });
    expect(missingFile).toEqual(missingRaw);
    expect(await readFile(outputPath, 'utf8')).toBe('asset bytes');
    expect(downloadRequests).toHaveLength(3);
    expect(requests.filter((request) => request.pathname.startsWith('/files/'))
      .every((request) => request.authorization === null)).toBe(true);
  });

  test('classifies interrupted and timed out streams and removes temporary downloads', async () => {
    const partialPath = join(configDirectory, 'partial.bin');
    const timeoutPath = join(configDirectory, 'timeout.bin');
    const partialFile = await runCli(['assets', 'download', 'asset-partial', '--output', partialPath]);
    const partialRaw = await runCli(['assets', 'download', 'asset-partial', '--output', '-']);
    const timeoutFile = await runCli([
      '--timeout', '0.1', 'assets', 'download', 'asset-timeout', '--output', timeoutPath,
    ]);
    const timeoutRaw = await runCli([
      '--timeout', '0.1', 'assets', 'download', 'asset-timeout', '--output', '-',
    ]);
    const outputFiles = await readdir(configDirectory);

    expect(partialFile.exitCode).toBe(5);
    expect(partialRaw.exitCode).toBe(5);
    expect(partialRaw.stdout).toBe('partial');
    expect(timeoutFile.exitCode).toBe(4);
    expect(timeoutRaw.exitCode).toBe(4);
    expect(timeoutRaw.stdout).toBe('partial');
    expect(outputFiles).not.toContain('partial.bin');
    expect(outputFiles).not.toContain('timeout.bin');
    expect(outputFiles.some((name) => name.startsWith('.partial.bin.') || name.startsWith('.timeout.bin.'))).toBe(false);
  });

  test('returns a JSON error for terminal wait failures', async () => {
    const terminal = await runCli(['--json', 'assets', 'wait', 'asset-error', '--poll-interval', '0.01']);

    expect(terminal.exitCode).toBe(1);
    expect(terminal.stdout).toBe('');
    expect(terminal.stderr).toBe(
      '{"ok":false,"error":{"type":"terminal_error","message":"Asset asset-error ended with status error: render failed"}}\n',
    );
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
  if (url.pathname === '/files/redirect') {
    return new Response(null, { headers: { Location: '/files/good' }, status: 302 });
  }
  if (url.pathname === '/files/redirect-credentials') {
    const destination = new URL('/files/good', server.url);
    destination.username = 'download';
    destination.password = 'secret';
    return new Response(null, { headers: { Location: destination.href }, status: 302 });
  }
  if (url.pathname === '/files/redirect-insecure') {
    return new Response(null, { headers: { Location: 'http://example.com/asset' }, status: 302 });
  }
  if (url.pathname === '/files/redirect-malformed') {
    return new Response(null, { headers: { Location: 'http://[' }, status: 302 });
  }
  if (url.pathname === '/files/redirect-loop') {
    return new Response(null, { headers: { Location: '/files/redirect-loop' }, status: 302 });
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
  if (pathname.endsWith('/asset-ready')) {
    return { ...getAssetResponse('asset-ready'), kind: 'slideshow' };
  }
  if (pathname.endsWith('/asset-wait')) {
    waitRequestCount += 1;
    return waitRequestCount === 1
      ? { ...getAssetResponse('asset-wait'), status: 'processing', url: undefined, progress: 40 }
      : getAssetResponse('asset-wait');
  }
  if (pathname.endsWith('/asset-error')) {
    return { ...getAssetResponse('asset-error'), status: 'error', url: undefined, error: 'render failed' };
  }
  if (pathname.endsWith('/asset-partial')) {
    return { ...getAssetResponse('asset-partial'), url: partialDownloadUrl };
  }
  if (pathname.endsWith('/asset-timeout')) {
    return { ...getAssetResponse('asset-timeout'), url: timeoutDownloadUrl };
  }
  if (pathname.endsWith('/asset-redirect-credentials')) {
    return { ...getAssetResponse('asset-redirect-credentials'), url: `${server.url.href}files/redirect-credentials` };
  }
  if (pathname.endsWith('/asset-redirect-insecure')) {
    return { ...getAssetResponse('asset-redirect-insecure'), url: `${server.url.href}files/redirect-insecure` };
  }
  if (pathname.endsWith('/asset-redirect-malformed')) {
    return { ...getAssetResponse('asset-redirect-malformed'), url: `${server.url.href}files/redirect-malformed` };
  }
  if (pathname.endsWith('/asset-redirect-loop')) {
    return { ...getAssetResponse('asset-redirect-loop'), url: `${server.url.href}files/redirect-loop` };
  }
  if (pathname.endsWith('/asset-redirect')) {
    return { ...getAssetResponse('asset-redirect'), url: `${server.url.href}files/redirect` };
  }
  if (pathname.endsWith('/asset-missing')) {
    return { ...getAssetResponse('asset-missing'), url: `${server.url.href}files/missing` };
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
