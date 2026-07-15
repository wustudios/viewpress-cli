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
  test('uses every video generation command through the CLI', async () => {
    const promptPath = join(configDirectory, 'video-prompt.txt');
    await writeFile(promptPath, 'Move through a neon market at night', 'utf8');
    const generated = await runCli([
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
    const generationRequest = requests.at(-1);
    const estimated = await runCli([
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
    const estimateRequest = requests.at(-1);

    expect(generated).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: '{"assetId":"asset-generated","status":"pending"}\n',
    });
    expect(estimated).toEqual({ exitCode: 0, stderr: '', stdout: 'Estimated cost: 14 credits.\n' });
    expect(generationRequest?.method).toBe('POST');
    expect(generationRequest?.url.pathname).toBe('/api/v1/videos/generations');
    expect(generationRequest?.body).toEqual({
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
    expect(estimateRequest?.url.pathname).toBe('/api/v1/videos/generations');
    expect(estimateRequest?.body).toEqual({
      aspect_ratio: '9:16',
      duration_sec: 6,
      estimate_only: true,
      model: 'V-LITE',
      name: 'Estimate',
      prompt: 'Slow camera push',
      video_id: 'video-2',
      with_audio: true,
    });
    const motionTransfer = await runCli(
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
    const talkingImage = await runCli([
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
    const userGeneratedContentAd = await runCli([
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
    const timelapse = await runCli([
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

    expect(motionTransfer.stdout).toBe('Started video asset asset-motion (pending).\n');
    expect(talkingImage.stdout).toBe('{"assetId":"asset-talking","status":"pending"}\n');
    expect(userGeneratedContentAd.stdout).toBe('Started video asset asset-ugc (pending).\n');
    expect(timelapse.stdout).toBe(
      '{"assetId":"asset-timelapse","endFrameAssetId":"asset-end-frame","status":"pending"}\n',
    );
    expect(requests.slice(-4).map((request) => request.url.pathname)).toEqual([
      '/api/v1/videos/motion-transfers',
      '/api/v1/videos/talking-images',
      '/api/v1/videos/ugc-ads',
      '/api/v1/videos/timelapse-scenes',
    ]);
    expect(requests.at(-4)?.body).toEqual({
      character_orientation: 'image',
      image_asset_id: 'image-character',
      keep_original_sound: false,
      motion_video_asset_id: 'video-motion',
      name: 'Dance',
      prompt: 'Keep the red jacket',
      video_id: 'video-3',
    });
    expect(requests.at(-3)?.body).toEqual({
      aspect_ratio: '9:16',
      audio_asset_id: 'audio-dialogue',
      caption: false,
      image_asset_id: 'image-presenter',
      name: 'Presenter',
      resolution: '720p',
      talking_style: 'stable',
      video_id: 'video-4',
    });
    expect(requests.at(-2)?.body).toEqual({
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
    expect(requests.at(-1)?.body).toEqual({
      aspect_ratio: '9:16',
      name: 'Workshop',
      setting_notes: 'Small sunlit studio',
      start_image_asset_id: 'image-workshop',
      step_description: 'Install the wooden shelf brackets',
      video_id: 'video-6',
      worker_description: 'One carpenter',
    });
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

async function runCli(arguments_: string[], stdin?: string): Promise<CliResult> {
  const environment = {
    ...process.env,
    VIEWPRESS_API_KEY: 'vp_test_key',
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
