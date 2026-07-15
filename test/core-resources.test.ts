import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import type { Socket } from 'node:net';

interface RecordedRequest {
  body: unknown;
  headers: Headers;
  method: string;
  url: URL;
}

interface CliResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

const requests: RecordedRequest[] = [];
let apiBodyServer: ReturnType<typeof createServer>;
let apiBodyServerUrl = '';
let configDirectory = '';
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  configDirectory = await mkdtemp(join(tmpdir(), 'viewpress-cli-resources-'));
  apiBodyServer = createServer((socket) => {
    socket.once('data', (request) => {
      sendApiBodyResponse(socket, request.toString());
    });
  });
  await new Promise<void>((resolve, reject) => {
    apiBodyServer.once('error', reject);
    apiBodyServer.listen(0, '127.0.0.1', resolve);
  });
  const apiBodyAddress = apiBodyServer.address();
  if (!apiBodyAddress || typeof apiBodyAddress === 'string') {
    throw new Error('API body server did not expose a TCP port.');
  }
  apiBodyServerUrl = `http://127.0.0.1:${String(apiBodyAddress.port)}`;
  server = Bun.serve({
    fetch: handleRequest,
    hostname: '127.0.0.1',
    port: 0,
  });
});

afterAll(async () => {
  await server.stop(true);
  await new Promise<void>((resolve, reject) => {
    apiBodyServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  await rm(configDirectory, { force: true, recursive: true });
});

describe('core resource commands', () => {
  test('uses every core resource command through authenticated requests', async () => {
    const listed = await runCli(
      ['--json', '--api-url', `${server.url.href}api/v1`, 'projects', 'list'],
      'https://ignored.example/api/v1',
    );
    const created = await runCli(['projects', 'create', '--name', 'Launch', '--json']);
    const listedVideos = await runCli(['videos', 'list', '--project-id', 'project-1', '--json']);
    const createdVideo = await runCli([
      'videos',
      'create',
      '--project-id',
      'project-1',
      '--name',
      'Demo',
      '--json',
    ]);
    const credits = await runCli(['credits', 'get', '--timeout', '2', '--json']);
    const styles = await runCli(['styles', 'list', '--json']);
    const voices = await runCli([
      'voices',
      'list',
      '--project-id',
      'project-1',
      '--query',
      'calm',
      '--gender',
      'female',
      '--limit',
      '12',
      '--json',
    ]);

    expect(listed.stdout).toBe('{"ok":true,"data":{"projects":[{"id":"project-1","name":"Main","createdAt":1000}]}}\n');
    expect(created.stdout).toBe('{"ok":true,"data":{"id":"project-2","name":"Launch"}}\n');
    expect(JSON.parse(listedVideos.stdout)).toEqual({
      ok: true,
      data: {
        videos: [
          {
            createdAt: '2026-07-15T00:00:00.000Z',
            id: 'video-1',
            name: 'First',
            url: 'https://viewpress.ai/videos/video-1',
          },
        ],
      },
    });
    expect(JSON.parse(createdVideo.stdout)).toEqual({
      ok: true,
      data: { id: 'video-2', name: 'Demo', url: 'https://viewpress.ai/videos/video-2' },
    });
    expect(JSON.parse(credits.stdout)).toEqual({ ok: true, data: { available: 8, held: 2, total: 10 } });
    expect(JSON.parse(styles.stdout)).toEqual({ ok: true, data: getStylesResponse() });
    expect(JSON.parse(voices.stdout)).toEqual({
      ok: true,
      data: {
        presets: ['Wise_Woman'],
        voices: [
          {
            age: 'adult',
            description: 'Warm and clear',
            gender: 'female',
            id: 'voice-1',
            language: 'en',
            name: 'Calm',
            type: 'cloned',
          },
        ],
      },
    });
    expect(requests[0]?.headers.get('Authorization')).toBe('Bearer vp_test_key');
    expect(requests[1]?.body).toEqual({ name: 'Launch' });
    expect(requests[1]?.headers.get('Content-Type')).toBe('application/json');
    expect(requests[2]?.url.searchParams.get('project_id')).toBe('project-1');
    expect(requests[3]?.body).toEqual({ name: 'Demo', project_id: 'project-1' });
    expect(requests.at(-1)?.url.searchParams.toString()).toBe(
      'project_id=project-1&query=calm&gender=female&limit=12',
    );

    const bodyTimeout = await runCli(
      ['--timeout', '0.05', '--json', 'projects', 'list'],
      `${apiBodyServerUrl}/timeout/api/v1`,
    );
    const truncatedBody = await runCli(
      ['--json', 'projects', 'list'],
      `${apiBodyServerUrl}/truncated/api/v1`,
    );
    const malformedBody = await runCli(
      ['--json', 'projects', 'list'],
      `${apiBodyServerUrl}/malformed/api/v1`,
    );

    expect(bodyTimeout).toEqual({
      exitCode: 4,
      stderr: '{"ok":false,"error":{"type":"timeout_error","message":"Request timed out after 0.05 seconds."}}\n',
      stdout: '',
    });
    expect(truncatedBody.exitCode).toBe(5);
    expect(truncatedBody.stderr).toContain('"type":"transport_error"');
    expect(truncatedBody.stdout).toBe('');
    expect(malformedBody).toEqual({
      exitCode: 1,
      stderr: '{"ok":false,"error":{"type":"invalid_response","message":"Viewpress returned a non-JSON response for GET projects with status 200.","status":200}}\n',
      stdout: '',
    });
  });
});

function sendApiBodyResponse(socket: Socket, request: string): void {
  const partialBody = '{"projects":[';
  if (request.startsWith('GET /timeout/')) {
    socket.write(getHttpResponse(partialBody, 100));
    return;
  }
  if (request.startsWith('GET /truncated/')) {
    socket.end(getHttpResponse(partialBody, 100));
    return;
  }

  const malformedBody = '{"projects":';
  socket.end(getHttpResponse(malformedBody, Buffer.byteLength(malformedBody)));
}

function getHttpResponse(body: string, contentLength: number): string {
  return `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${String(contentLength)}\r\nConnection: close\r\n\r\n${body}`;
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const body = request.method === 'POST' ? await request.json() : null;
  requests.push({ body, headers: request.headers, method: request.method, url });

  if (url.pathname === '/api/v1/projects' && request.method === 'GET') {
    return Response.json({ projects: [{ createdAt: 1000, id: 'project-1', name: 'Main' }] });
  }

  if (url.pathname === '/api/v1/projects' && request.method === 'POST') {
    return Response.json({ id: 'project-2', name: 'Launch' });
  }

  if (url.pathname === '/api/v1/videos' && request.method === 'GET') {
    return Response.json({
      videos: [
        {
          createdAt: '2026-07-15T00:00:00.000Z',
          id: 'video-1',
          name: 'First',
          url: 'https://viewpress.ai/videos/video-1',
        },
      ],
    });
  }

  if (url.pathname === '/api/v1/videos' && request.method === 'POST') {
    return Response.json({
      id: 'video-2',
      name: 'Demo',
      url: 'https://viewpress.ai/videos/video-2',
    });
  }

  if (url.pathname === '/api/v1/credits') {
    return Response.json({ available: 8, held: 2, total: 10 });
  }

  if (url.pathname === '/api/v1/styles') {
    return Response.json(getStylesResponse());
  }

  if (url.pathname === '/api/v1/voices') {
    return Response.json({
      presets: ['Wise_Woman'],
      voices: [
        {
          age: 'adult',
          description: 'Warm and clear',
          gender: 'female',
          id: 'voice-1',
          language: 'en',
          name: 'Calm',
          type: 'cloned',
        },
      ],
    });
  }

  return Response.json({ message: 'Not found' }, { status: 404 });
}

function getStylesResponse(): unknown {
  return {
    imageModels: [{ code: 'I-FAST', credits: 1, useFor: 'Fast images' }],
    videoStyles: [
      {
        code: 'V-STANDARD',
        creditsPerSecond: 2,
        durationSec: { max: 15, min: 1 },
        inputs: {
          endImage: false,
          negativePrompt: false,
          referenceAudio: 0,
          referenceImages: 7,
          referenceVideos: 0,
          startImage: true,
        },
        label: 'Stylized',
        useFor: 'Animation',
      },
    ],
  };
}

async function runCli(arguments_: string[], environmentApiUrl = `${server.url.href}api/v1`): Promise<CliResult> {
  const childProcess = Bun.spawn(['bun', 'run', 'src/cli.ts', ...arguments_], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      VIEWPRESS_API_KEY: 'vp_test_key',
      VIEWPRESS_API_URL: environmentApiUrl,
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
