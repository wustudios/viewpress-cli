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
  configDirectory = await mkdtemp(join(tmpdir(), 'viewpress-cli-audio-'));
  server = Bun.serve({ fetch: handleRequest, hostname: '127.0.0.1', port: 0 });
});

afterAll(async () => {
  await server.stop(true);
  await rm(configDirectory, { force: true, recursive: true });
});

describe('audio commands', () => {
  test('generates speech, music, and sound effects through the CLI', async () => {
    const speech = await runCli(
      [
        'speech',
        'generate',
        '--video-id',
        'video-2',
        '--name',
        'Character',
        '--text-file',
        '-',
        '--voice-preset',
        'Young_Knight',
        '--emotion',
        'surprised',
        '--speed',
        '1.25',
        '--pitch',
        '-3',
        '--vol',
        '0.8',
        '--no-english-normalization',
        '--language-boost',
        'English',
      ],
      'The gate is open.',
    );
    const promptPath = join(configDirectory, 'music-prompt.txt');
    await writeFile(promptPath, 'A slow build into a bright chorus', 'utf8');
    const music = await runCli([
      'music',
      'generate',
      '--video-id',
      'video-4',
      '--name',
      'Theme',
      '--prompt-file',
      promptPath,
      '--style',
      'indie pop',
      '--duration-sec',
      '90',
      '--description',
      'Opening theme',
    ]);
    const soundEffect = await runCli([
      'sfx',
      'generate',
      '--video-id',
      'video-7',
      '--name',
      'Rain',
      '--prompt',
      'Rain against a metal roof',
      '--duration-sec',
      '8.5',
      '--prompt-influence',
      '0.75',
      '--description',
      'Background ambience',
    ]);

    expect([speech, music, soundEffect].every((result) => result.exitCode === 0)).toBe(true);
    expect(speech.stdout).toBe('Started speech asset asset-speech (pending).\n');
    expect(music.stdout).toBe('Started music asset asset-music (pending).\n');
    expect(soundEffect.stdout).toBe('Started sfx asset asset-sfx (pending).\n');
    expect(requests.map((request) => request.url.pathname)).toEqual([
      '/api/v1/speech',
      '/api/v1/music',
      '/api/v1/sfx',
    ]);
    expect(requests[0]?.authorization).toBe('Bearer vp_test_key');
    expect(requests[0]?.body).toEqual({
      emotion: 'surprised',
      english_normalization: false,
      language_boost: 'English',
      name: 'Character',
      pitch: -3,
      speed: 1.25,
      text: 'The gate is open.',
      video_id: 'video-2',
      voice_preset: 'Young_Knight',
      vol: 0.8,
    });
    expect(requests[1]?.body).toEqual({
      description: 'Opening theme',
      duration_seconds: 90,
      instrumental_only: true,
      name: 'Theme',
      prompt: 'A slow build into a bright chorus',
      style: 'indie pop',
      video_id: 'video-4',
    });
    expect(requests[2]?.body).toEqual({
      description: 'Background ambience',
      duration_seconds: 8.5,
      name: 'Rain',
      prompt: 'Rain against a metal roof',
      prompt_influence: 0.75,
      video_id: 'video-7',
    });
  });
});

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const body = await request.json();
  requests.push({ authorization: request.headers.get('Authorization'), body, method: request.method, url });

  if (url.pathname === '/api/v1/speech' && request.method === 'POST') {
    return Response.json({ assetId: 'asset-speech', status: 'pending' });
  }
  if (url.pathname === '/api/v1/music' && request.method === 'POST') {
    return Response.json({ assetId: 'asset-music', status: 'pending' });
  }
  if (url.pathname === '/api/v1/sfx' && request.method === 'POST') {
    return Response.json({ assetId: 'asset-sfx', status: 'pending' });
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
