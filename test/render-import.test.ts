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
  test('creates renders and imports media through authenticated requests', async () => {
    const timelinePath = join(configDirectory, 'timeline.json');
    const timeline = {
      backgroundColor: '#101010',
      durationInFrames: 180,
      fps: 30,
      metadata: { version: 2 },
      tracks: [{ clips: [{ assetId: 'image-1', durationInFrames: 180 }] }],
    };
    await writeFile(timelinePath, JSON.stringify(timeline), 'utf8');
    const rendered = await runCli([
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
    const imported = await runCli([
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

    expect(rendered).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: '{"ok":true,"data":{"assetId":"asset-render","status":"pending"}}\n',
    });
    expect(imported).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: '{"ok":true,"data":{"assetId":"asset-imported","kind":"video","mimeType":"video/mp4","status":"ready"}}\n',
    });
    expect(requests[0]).toMatchObject({
      authorization: 'Bearer vp_test_key',
      body: { name: 'Launch cut', timeline, video_id: 'video-1' },
      method: 'POST',
    });
    expect(requests[0]?.url.pathname).toBe('/api/v1/renders');
    expect(requests[1]).toMatchObject({
      authorization: 'Bearer vp_test_key',
      body: {
        name: 'Intro',
        url: 'https://cdn.example.com/media/intro.mp4',
        video_id: 'video-3',
      },
      method: 'POST',
    });
    expect(requests[1]?.url.pathname).toBe('/api/v1/media/imports');
  });

  test('accepts fd-prefixed domains and rejects private addresses for media import', async () => {
    const domainImport = await runCli([
      'media', 'import', '--video-id', 'video-3', '--url', 'https://fdsports.example/media/intro.mp4', '--json',
    ]);
    const privateIpv6Import = await runCli([
      'media', 'import', '--video-id', 'video-3', '--url', 'https://[fd00::1]/media/intro.mp4', '--json',
    ]);
    const privateIpv4Import = await runCli([
      'media', 'import', '--video-id', 'video-3', '--url', 'https://192.168.0.10/media/intro.mp4', '--json',
    ]);

    expect(domainImport.exitCode).toBe(0);
    expect(requests.at(-1)?.body).toMatchObject({ url: 'https://fdsports.example/media/intro.mp4' });
    expect(privateIpv6Import.exitCode).toBe(2);
    expect(privateIpv6Import.stderr).toContain('public HTTPS URL');
    expect(privateIpv4Import.exitCode).toBe(2);
    expect(privateIpv4Import.stderr).toContain('public HTTPS URL');
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
