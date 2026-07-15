import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
let configDirectory = '';
let server: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  configDirectory = await mkdtemp(join(tmpdir(), 'viewpress-cli-resources-'));
  server = Bun.serve({
    fetch: handleRequest,
    hostname: '127.0.0.1',
    port: 0,
  });
});

afterAll(async () => {
  await server.stop(true);
  await rm(configDirectory, { force: true, recursive: true });
});

describe('core resource commands', () => {
  test('lists and creates projects with authenticated requests', async () => {
    const listed = await runCli(['projects', 'list', '--json']);
    const created = await runCli(['projects', 'create', '--name', 'Launch', '--json']);

    expect(listed).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: '{"projects":[{"id":"project-1","name":"Main","createdAt":1000}]}\n',
    });
    expect(created).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: '{"id":"project-2","name":"Launch"}\n',
    });
    expect(requests[0]?.headers.get('Authorization')).toBe('Bearer vp_test_key');
    expect(requests[1]?.body).toEqual({ name: 'Launch' });
    expect(requests[1]?.headers.get('Content-Type')).toBe('application/json');
  });

  test('lists and creates videos with exact project fields', async () => {
    const listed = await runCli(['videos', 'list', '--project-id', 'project-1', '--json']);
    const created = await runCli([
      'videos',
      'create',
      '--project-id',
      'project-1',
      '--name',
      'Demo',
      '--json',
    ]);

    expect(JSON.parse(listed.stdout)).toEqual({
      videos: [
        {
          createdAt: '2026-07-15T00:00:00.000Z',
          id: 'video-1',
          name: 'First',
          url: 'https://viewpress.ai/videos/video-1',
        },
      ],
    });
    expect(JSON.parse(created.stdout)).toEqual({
      id: 'video-2',
      name: 'Demo',
      url: 'https://viewpress.ai/videos/video-2',
    });
    expect(requests[2]?.url.searchParams.get('project_id')).toBe('project-1');
    expect(requests[3]?.body).toEqual({ name: 'Demo', project_id: 'project-1' });
  });

  test('gets credits and the complete styles catalog', async () => {
    const credits = await runCli(['credits', 'get', '--json']);
    const styles = await runCli(['styles', 'list', '--json']);
    const humanCredits = await runCli(['credits', 'get']);

    expect(JSON.parse(credits.stdout)).toEqual({ available: 8, held: 2, total: 10 });
    expect(JSON.parse(styles.stdout)).toEqual(getStylesResponse());
    expect(humanCredits.stdout).toBe('Total: 10\nAvailable: 8\nHeld: 2\n');
    expect(credits.exitCode).toBe(0);
    expect(styles.exitCode).toBe(0);
  });

  test('lists voices with validated filters and presets', async () => {
    const result = await runCli([
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
    const request = requests.at(-1);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
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
    expect(request?.url.searchParams.toString()).toBe(
      'project_id=project-1&query=calm&gender=female&limit=12',
    );
  });

  test('rejects missing values and unknown flags before fetch', async () => {
    const requestCount = requests.length;
    const missing = await runCli(['videos', 'create', '--project-id', 'project-1']);
    const missingValue = await runCli(['projects', 'create', '--name', '--json']);
    const unknown = await runCli(['voices', 'list', '--project-id', 'project-1', '--unknown']);

    expect(missing.exitCode).toBe(2);
    expect(missing.stderr).toContain('requires --name');
    expect(missingValue.exitCode).toBe(2);
    expect(missingValue.stderr).toContain('--name requires a value');
    expect(unknown.exitCode).toBe(2);
    expect(unknown.stderr).toContain('Unknown or repeated');
    expect(requests).toHaveLength(requestCount);
  });
});

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
