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
  test('generates speech without sending a voice selector', async () => {
    const result = await runCli([
      'speech',
      'generate',
      '--video-id',
      'video-1',
      '--name',
      'Narration',
      '--text',
      'Welcome to the show.',
      '--json',
    ]);
    const request = requests.at(-1);

    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: '{"assetId":"asset-speech","status":"pending"}\n',
    });
    expect(request).toMatchObject({
      authorization: 'Bearer vp_test_key',
      body: {
        name: 'Narration',
        text: 'Welcome to the show.',
        video_id: 'video-1',
      },
      method: 'POST',
    });
    expect(request?.url.pathname).toBe('/api/v1/speech');
    expect(request?.body).toEqual({
      name: 'Narration',
      text: 'Welcome to the show.',
      video_id: 'video-1',
    });
  });

  test('generates speech with every optional setting and stdin text', async () => {
    const result = await runCli(
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
    const request = requests.at(-1);

    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: 'Started speech asset asset-speech (pending).\n',
    });
    expect(request?.body).toEqual({
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
  });

  test('generates speech with a saved voice record', async () => {
    const result = await runCli([
      'speech',
      'generate',
      '--video-id',
      'video-3',
      '--name',
      'Saved voice',
      '--text',
      'Read this line.',
      '--voice-record-id',
      'voice-1',
      '--english-normalization',
    ]);

    expect(result.exitCode).toBe(0);
    expect(requests.at(-1)?.body).toEqual({
      english_normalization: true,
      name: 'Saved voice',
      text: 'Read this line.',
      video_id: 'video-3',
      voice_record_id: 'voice-1',
    });
  });

  test('generates music from a prompt file with explicit defaults', async () => {
    const promptPath = join(configDirectory, 'music-prompt.txt');
    await writeFile(promptPath, 'A slow build into a bright chorus', 'utf8');
    const result = await runCli([
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
      '--duration-seconds',
      '90',
      '--description',
      'Opening theme',
    ]);
    const request = requests.at(-1);

    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: 'Started music asset asset-music (pending).\n',
    });
    expect(request?.method).toBe('POST');
    expect(request?.url.pathname).toBe('/api/v1/music');
    expect(request?.body).toEqual({
      description: 'Opening theme',
      duration_seconds: 90,
      instrumental_only: true,
      name: 'Theme',
      prompt: 'A slow build into a bright chorus',
      style: 'indie pop',
      video_id: 'video-4',
    });
  });

  test('generates music with vocals and JSON output', async () => {
    const result = await runCli([
      'music',
      'generate',
      '--video-id',
      'video-5',
      '--name',
      'Song',
      '--prompt',
      'Warm acoustic duet',
      '--style',
      'folk',
      '--duration-seconds',
      '180',
      '--no-instrumental-only',
      '--json',
    ]);

    expect(result.stdout).toBe('{"assetId":"asset-music","status":"pending"}\n');
    expect(requests.at(-1)?.body).toEqual({
      duration_seconds: 180,
      instrumental_only: false,
      name: 'Song',
      prompt: 'Warm acoustic duet',
      style: 'folk',
      video_id: 'video-5',
    });
  });

  test('generates a sound effect with explicit defaults', async () => {
    const result = await runCli([
      'sfx',
      'generate',
      '--video-id',
      'video-6',
      '--name',
      'Door',
      '--prompt',
      'Heavy wooden door closing',
      '--json',
    ]);
    const request = requests.at(-1);

    expect(result.stdout).toBe('{"assetId":"asset-sfx","status":"pending"}\n');
    expect(request?.url.pathname).toBe('/api/v1/sfx');
    expect(request?.body).toEqual({
      duration_seconds: 2,
      name: 'Door',
      prompt: 'Heavy wooden door closing',
      prompt_influence: 0.5,
      video_id: 'video-6',
    });
  });

  test('generates a configured sound effect', async () => {
    const result = await runCli([
      'sfx',
      'generate',
      '--video-id',
      'video-7',
      '--name',
      'Rain',
      '--prompt',
      'Rain against a metal roof',
      '--duration-seconds',
      '8.5',
      '--prompt-influence',
      '0.75',
      '--description',
      'Background ambience',
    ]);

    expect(result.stdout).toBe('Started sfx asset asset-sfx (pending).\n');
    expect(requests.at(-1)?.body).toEqual({
      description: 'Background ambience',
      duration_seconds: 8.5,
      name: 'Rain',
      prompt: 'Rain against a metal roof',
      prompt_influence: 0.75,
      video_id: 'video-7',
    });
  });

  test('rejects missing, conflicting, repeated, unknown, and invalid speech inputs before fetch', async () => {
    const requestCount = requests.length;
    const results = await Promise.all([
      runCli(['speech', 'generate', '--name', 'Missing video', '--text', 'Enough text']),
      runCli([
        'speech', 'generate', '--video-id', 'video', '--name', 'Conflict', '--text', 'Enough text',
        '--voice-preset', 'Wise_Woman', '--voice-record-id', 'voice',
      ]),
      runCli([
        'speech', 'generate', '--video-id', 'video', '--name', 'Repeated', '--text', 'Enough text',
        '--speed', '1', '--speed', '1.2',
      ]),
      runCli(['speech', 'generate', '--video-id', 'video', '--name', 'Unknown', '--text', 'Enough text', '--wat']),
      runCli(['speech', 'generate', '--video-id', 'video', '--name', 'Pitch', '--text', 'Enough text', '--pitch', '1.5']),
      runCli(['speech', 'generate', '--video-id', 'video', '--name', 'Preset', '--text', 'Enough text', '--voice-preset', 'Unknown']),
      runCli(['speech', 'generate', '--video-id', 'video', '--name', 'Long', '--text', 'x'.repeat(10_001)]),
    ]);

    expect(results.every((result) => result.exitCode === 2)).toBe(true);
    expect(results[0].stderr).toContain('require --video-id');
    expect(results[1].stderr).toContain('conflicting speech option');
    expect(results[2].stderr).toContain('repeated');
    expect(results[3].stderr).toContain('Unknown');
    expect(results[4].stderr).toContain('integer from -12 to 12');
    expect(results[5].stderr).toContain('Wise_Woman');
    expect(results[6].stderr).toContain('1 to 10000');
    expect(requests).toHaveLength(requestCount);
  });

  test('rejects invalid music and sound effect inputs before fetch', async () => {
    const requestCount = requests.length;
    const results = await Promise.all([
      runCli(['music', 'generate', '--video-id', 'video', '--name', 'Music', '--prompt', 'Enough prompt', '--style', 'x', '--duration-seconds', '20']),
      runCli(['music', 'generate', '--video-id', 'video', '--name', 'Music', '--prompt', 'Enough prompt', '--style', 'folk', '--duration-seconds', '2.9']),
      runCli(['music', 'generate', '--video-id', 'video', '--name', 'Music', '--prompt', 'Enough prompt', '--prompt-file', '-', '--style', 'folk', '--duration-seconds', '20']),
      runCli(['music', 'generate', '--video-id', 'video', '--name', 'Music', '--prompt', 'Enough prompt', '--style', 'folk', '--duration-seconds', '20', '--instrumental-only', '--no-instrumental-only']),
      runCli(['sfx', 'generate', '--video-id', 'video', '--name', 'SFX', '--prompt', 'Enough prompt', '--duration-seconds', '10.1']),
      runCli(['sfx', 'generate', '--video-id', 'video', '--name', 'SFX', '--prompt', 'Enough prompt', '--prompt-influence', '-0.1']),
      runCli(['sfx', 'generate', '--video-id', 'video', '--name', 'SFX', '--prompt', 'no']),
    ]);

    expect(results.every((result) => result.exitCode === 2)).toBe(true);
    expect(results[0].stderr).toContain('at least 2 characters');
    expect(results[1].stderr).toContain('3 to 480');
    expect(results[2].stderr).toContain('conflicting music option');
    expect(results[3].stderr).toContain('conflicting music option');
    expect(results[4].stderr).toContain('0.5 to 10');
    expect(results[5].stderr).toContain('0 to 1');
    expect(results[6].stderr).toContain('at least 3 characters');
    expect(requests).toHaveLength(requestCount);
  });

  test('shows command help without authentication', async () => {
    const result = await runCli(['speech', 'generate', '--help'], undefined, false);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: viewpress speech generate');
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
