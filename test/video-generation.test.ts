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
  configDirectory = await mkdtemp(join(tmpdir(), 'viewpress-cli-video-generation-'));
  server = Bun.serve({ fetch: handleRequest, hostname: '127.0.0.1', port: 0 });
});

afterAll(async () => {
  await server.stop(true);
  await rm(configDirectory, { force: true, recursive: true });
});

describe('video generation commands', () => {
  test('generates with every supported input and explicit audio choice', async () => {
    const promptPath = join(configDirectory, 'video-prompt.txt');
    await writeFile(promptPath, 'Move through a neon market at night', 'utf8');
    const result = await runCli([
      'videos',
      'generate',
      '--video-id',
      'video-1',
      '--name',
      'Market',
      '--prompt-file',
      promptPath,
      '--model',
      'V-ULTRA',
      '--duration-sec',
      '12',
      '--aspect-ratio',
      '16:9',
      '--no-audio',
      '--start-image-asset-id',
      'image-start',
      '--end-image-asset-id',
      'image-end',
      '--reference-image-asset-id',
      'image-1',
      '--reference-image-asset-id',
      'image-2',
      '--reference-video-asset-id',
      'video-ref',
      '--reference-audio-asset-id',
      'audio-ref',
      '--negative-prompt',
      'No text',
      '--json',
    ]);
    const request = requests.at(-1);

    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: '{"assetId":"asset-generated","status":"pending"}\n',
    });
    expect(request?.method).toBe('POST');
    expect(request?.url.pathname).toBe('/api/v1/videos/generations');
    expect(request?.body).toEqual({
      aspect_ratio: '16:9',
      duration_sec: 12,
      end_image_asset_id: 'image-end',
      estimate_only: false,
      model: 'V-ULTRA',
      name: 'Market',
      negative_prompt: 'No text',
      prompt: 'Move through a neon market at night',
      reference_audio_asset_ids: ['audio-ref'],
      reference_image_asset_ids: ['image-1', 'image-2'],
      reference_video_asset_ids: ['video-ref'],
      start_image_asset_id: 'image-start',
      video_id: 'video-1',
      with_audio: false,
    });
  });

  test('estimates with stable defaults and no optional keys', async () => {
    const result = await runCli([
      'videos',
      'estimate',
      '--video-id',
      'video-2',
      '--name',
      'Estimate',
      '--prompt',
      'Slow camera push',
      '--model',
      'V-LITE',
      '--duration-sec',
      '6',
    ]);
    const request = requests.at(-1);

    expect(result).toEqual({ exitCode: 0, stderr: '', stdout: 'Estimated cost: 14 credits.\n' });
    expect(request?.url.pathname).toBe('/api/v1/videos/generations');
    expect(request?.body).toEqual({
      aspect_ratio: '9:16',
      duration_sec: 6,
      estimate_only: true,
      model: 'V-LITE',
      name: 'Estimate',
      prompt: 'Slow camera push',
      video_id: 'video-2',
      with_audio: true,
    });
  });

  test('starts motion transfer with prompt stdin and explicit defaults', async () => {
    const result = await runCli(
      [
        'videos',
        'motion-transfer',
        '--video-id',
        'video-3',
        '--name',
        'Dance',
        '--image-asset-id',
        'image-character',
        '--motion-video-asset-id',
        'video-motion',
        '--prompt-file',
        '-',
        '--character-orientation',
        'image',
        '--no-original-sound',
      ],
      'Keep the red jacket',
    );
    const request = requests.at(-1);

    expect(result).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: 'Started video asset asset-motion (pending).\n',
    });
    expect(request?.url.pathname).toBe('/api/v1/videos/motion-transfers');
    expect(request?.body).toEqual({
      character_orientation: 'image',
      image_asset_id: 'image-character',
      keep_original_sound: false,
      motion_video_asset_id: 'video-motion',
      name: 'Dance',
      prompt: 'Keep the red jacket',
      video_id: 'video-3',
    });
  });

  test('starts a talking image with exact defaults', async () => {
    const result = await runCli([
      'videos',
      'talking-image',
      '--video-id',
      'video-4',
      '--name',
      'Presenter',
      '--image-asset-id',
      'image-presenter',
      '--audio-asset-id',
      'audio-dialogue',
      '--json',
    ]);
    const request = requests.at(-1);

    expect(result.stdout).toBe('{"assetId":"asset-talking","status":"pending"}\n');
    expect(result.exitCode).toBe(0);
    expect(request?.url.pathname).toBe('/api/v1/videos/talking-images');
    expect(request?.body).toEqual({
      aspect_ratio: '9:16',
      audio_asset_id: 'audio-dialogue',
      caption: false,
      image_asset_id: 'image-presenter',
      name: 'Presenter',
      resolution: '720p',
      talking_style: 'stable',
      video_id: 'video-4',
    });
  });

  test('starts a UGC ad with repeated image references and all notes', async () => {
    const result = await runCli([
      'videos',
      'ugc-ad',
      '--video-id',
      'video-5',
      '--name',
      'Review',
      '--subject-description',
      'A ceramic travel mug',
      '--dialogue',
      'This stays hot all morning.',
      '--reference-image-asset-id',
      'image-front',
      '--reference-image-asset-id',
      'image-side',
      '--reference-video-asset-id',
      'video-style',
      '--duration-sec',
      '10',
      '--scene-notes',
      'Bright kitchen',
      '--voice-notes',
      'Natural pace',
      '--camera-notes',
      'Handheld close-up',
      '--aspect-ratio',
      '16:9',
    ]);
    const request = requests.at(-1);

    expect(result.stdout).toBe('Started video asset asset-ugc (pending).\n');
    expect(request?.url.pathname).toBe('/api/v1/videos/ugc-ads');
    expect(request?.body).toEqual({
      aspect_ratio: '16:9',
      camera_notes: 'Handheld close-up',
      dialogue: 'This stays hot all morning.',
      duration_sec: 10,
      name: 'Review',
      reference_image_asset_ids: ['image-front', 'image-side'],
      reference_video_asset_id: 'video-style',
      scene_notes: 'Bright kitchen',
      subject_description: 'A ceramic travel mug',
      video_id: 'video-5',
      voice_notes: 'Natural pace',
    });
  });

  test('starts a timelapse and returns both asset ids', async () => {
    const result = await runCli([
      'videos',
      'timelapse-scene',
      '--video-id',
      'video-6',
      '--name',
      'Workshop',
      '--step-description',
      'Install the wooden shelf brackets',
      '--start-image-asset-id',
      'image-workshop',
      '--worker-description',
      'One carpenter',
      '--setting-notes',
      'Small sunlit studio',
      '--json',
    ]);
    const request = requests.at(-1);

    expect(result.stdout).toBe(
      '{"assetId":"asset-timelapse","endFrameAssetId":"asset-end-frame","status":"pending"}\n',
    );
    expect(request?.url.pathname).toBe('/api/v1/videos/timelapse-scenes');
    expect(request?.body).toEqual({
      aspect_ratio: '9:16',
      name: 'Workshop',
      setting_notes: 'Small sunlit studio',
      start_image_asset_id: 'image-workshop',
      step_description: 'Install the wooden shelf brackets',
      video_id: 'video-6',
      worker_description: 'One carpenter',
    });
  });

  test('rejects invalid generation inputs before fetch', async () => {
    const requestCount = requests.length;
    const invalidLiteDuration = await runCli([
      'videos',
      'generate',
      '--video-id',
      'video-1',
      '--name',
      'Bad duration',
      '--prompt',
      'Enough prompt',
      '--model',
      'V-LITE',
      '--duration-sec',
      '5',
    ]);
    const tooManyReferences = await runCli([
      'videos',
      'ugc-ad',
      '--video-id',
      'video-1',
      '--name',
      'Too many',
      '--subject-description',
      'A subject long enough',
      '--dialogue',
      'Hello',
      '--duration-sec',
      '4',
      '--reference-video-asset-id',
      'video-ref',
      ...getReferenceArguments(6),
    ]);
    const longMotionPrompt = await runCli([
      'videos',
      'motion-transfer',
      '--video-id',
      'video-1',
      '--name',
      'Long',
      '--image-asset-id',
      'image-1',
      '--motion-video-asset-id',
      'motion-1',
      '--prompt',
      'x'.repeat(2501),
    ]);
    const conflictingFlags = await runCli([
      'videos',
      'talking-image',
      '--video-id',
      'video-1',
      '--name',
      'Conflict',
      '--image-asset-id',
      'image-1',
      '--audio-asset-id',
      'audio-1',
      '--caption',
      '--no-caption',
    ]);

    expect(invalidLiteDuration.exitCode).toBe(2);
    expect(invalidLiteDuration.stderr).toContain('must be 4, 6, or 8');
    expect(tooManyReferences.exitCode).toBe(2);
    expect(tooManyReferences.stderr).toContain('1 to 5');
    expect(longMotionPrompt.exitCode).toBe(2);
    expect(longMotionPrompt.stderr).toContain('at most 2500');
    expect(conflictingFlags.exitCode).toBe(2);
    expect(conflictingFlags.stderr).toContain('conflicting videos option');
    expect(requests).toHaveLength(requestCount);
  });

  test('shows command-specific help without authentication', async () => {
    const result = await runCli(['videos', 'ugc-ad', '--help'], undefined, false);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: viewpress videos ugc-ad');
  });
});

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const body = await request.json();
  requests.push({ body, method: request.method, url });

  if (url.pathname === '/api/v1/videos/generations') {
    const parsedBody = body as { estimate_only?: boolean };
    if (parsedBody.estimate_only) {
      return Response.json({ credits: 14, status: 'estimate' });
    }
    return Response.json({ assetId: 'asset-generated', status: 'pending' });
  }
  if (url.pathname === '/api/v1/videos/motion-transfers') {
    return Response.json({ assetId: 'asset-motion', status: 'pending' });
  }
  if (url.pathname === '/api/v1/videos/talking-images') {
    return Response.json({ assetId: 'asset-talking', status: 'pending' });
  }
  if (url.pathname === '/api/v1/videos/ugc-ads') {
    return Response.json({ assetId: 'asset-ugc', status: 'pending' });
  }
  if (url.pathname === '/api/v1/videos/timelapse-scenes') {
    return Response.json({
      assetId: 'asset-timelapse',
      endFrameAssetId: 'asset-end-frame',
      status: 'pending',
    });
  }
  return Response.json({ message: 'Not found' }, { status: 404 });
}

function getReferenceArguments(count: number): string[] {
  return Array.from({ length: count }, (_, index) => ['--reference-image-asset-id', `image-${String(index)}`]).flat();
}

async function runCli(arguments_: string[], stdin?: string, authenticated = true): Promise<CliResult> {
  const environment = {
    ...process.env,
    VIEWPRESS_API_KEY: authenticated ? 'vp_test_key' : undefined,
    VIEWPRESS_API_URL: `${server.url.href}api/v1`,
    VIEWPRESS_CONFIG_DIR: configDirectory,
  };
  const childProcess = Bun.spawn(['bun', 'run', 'src/cli.ts', ...arguments_], {
    cwd: new URL('..', import.meta.url).pathname,
    env: environment,
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
