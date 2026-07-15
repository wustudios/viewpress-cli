import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface RecordedRequest {
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

interface MockPost {
  accountId: string;
  accountUsername: string;
  analytics: { comments: number; likes: number; shares: number; views: number };
  assetId: string;
  caption: string;
  id: string;
  platform: 'youtube';
  publishAt: number;
  state: 'scheduled';
}

const requests: RecordedRequest[] = [];
let configDirectory = '';
let optionsPath = '';
let server: ReturnType<typeof Bun.serve>;
let waitRequestCount = 0;

beforeAll(async () => {
  configDirectory = await mkdtemp(join(tmpdir(), 'viewpress-cli-social-'));
  optionsPath = join(configDirectory, 'youtube-options.json');
  await writeFile(optionsPath, JSON.stringify({ title: 'Launch', tags: ['demo'], made_for_kids: false }));
  server = Bun.serve({ fetch: handleRequest, hostname: '127.0.0.1', port: 0 });
});

afterAll(async () => {
  await server.stop(true);
  await rm(configDirectory, { force: true, recursive: true });
});

describe('social commands', () => {
  test('lists accounts and starts a connection without opening it', async () => {
    const list = await runCli(['social', 'accounts', 'list', '--project-id', 'project-1', '--json']);
    const connect = await runCli([
      'social', 'accounts', 'connect', '--project-id', 'project-1', '--platform', 'youtube', '--json',
    ]);

    expect(JSON.parse(list.stdout)).toEqual({
      ok: true,
      data: {
        accounts: [{
          connectedAt: 1_700_000_000_000,
          displayName: 'Viewpress',
          disabled: false,
          id: 'account-1',
          platform: 'youtube',
          username: '@viewpress',
        }],
      },
    });
    expect(JSON.parse(connect.stdout)).toEqual({
      ok: true,
      data: {
        instructions: 'Open this URL to connect YouTube.',
        url: 'https://viewpress.ai/connect/session-1',
      },
    });
    expect(requests.slice(0, 2)).toEqual([
      { body: undefined, method: 'GET', pathname: '/api/v1/social/accounts', search: '?project_id=project-1' },
      {
        body: { platform: 'youtube', project_id: 'project-1' },
        method: 'POST',
        pathname: '/api/v1/social/accounts/connections',
        search: '',
      },
    ]);
  });

  test('creates, lists, gets, waits for, and cancels posts through the CLI', async () => {
    const requestStart = requests.length;
    const create = await runCli([
      'social', 'posts', 'create', '--asset-id', 'asset-1', '--platform', 'youtube',
      '--connection-id', 'account-1', '--publish-at', '2026-07-20T09:00:00+09:00',
      '--caption', 'A new launch', '--options', optionsPath, '--json',
    ]);
    const list = await runCli([
      'social', 'posts', 'list', '--project-id', 'project-1', '--limit', '12', '--json',
    ]);
    const get = await runCli(['social', 'posts', 'get', 'post-get', '--json']);
    const wait = await runCli([
      'social', 'posts', 'wait', 'post-wait', '--poll-interval', '0.01', '--wait-timeout', '1', '--json',
    ]);
    const cancel = await runCli(['social', 'posts', 'cancel', 'post-cancel', '--json']);

    expect(JSON.parse(create.stdout)).toEqual({
      ok: true,
      data: { postId: 'post-created', state: 'scheduled', publishAt: 1_753_056_000_000 },
    });
    expect(JSON.parse(list.stdout)).toEqual({ ok: true, data: { posts: [getPost('post-listed')] } });
    expect(JSON.parse(get.stdout)).toEqual({ ok: true, data: getPost('post-get') });
    expect(JSON.parse(wait.stdout)).toEqual({
      ok: true,
      data: {
        ...getPost('post-wait'),
        platformPostUrl: 'https://youtube.com/shorts/post-wait',
        publishedAt: 1_753_056_100_000,
        state: 'published',
      },
    });
    expect(cancel).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: '{"ok":true,"data":{"canceled":true,"postId":"post-cancel"}}\n',
    });
    expect(requests.slice(requestStart)).toEqual([
      {
        body: {
          asset_id: 'asset-1',
          caption: 'A new launch',
          connection_id: 'account-1',
          options: {
            youtube: { made_for_kids: false, privacy_status: 'public', tags: ['demo'], title: 'Launch' },
          },
          platform: 'youtube',
          publish_at: '2026-07-20T00:00:00.000Z',
        },
        method: 'POST',
        pathname: '/api/v1/social/posts',
        search: '',
      },
      {
        body: undefined,
        method: 'GET',
        pathname: '/api/v1/social/posts',
        search: '?project_id=project-1&limit=12',
      },
      { body: undefined, method: 'GET', pathname: '/api/v1/social/posts/post-get', search: '' },
      { body: undefined, method: 'GET', pathname: '/api/v1/social/posts/post-wait', search: '' },
      { body: undefined, method: 'GET', pathname: '/api/v1/social/posts/post-wait', search: '' },
      { body: undefined, method: 'DELETE', pathname: '/api/v1/social/posts/post-cancel', search: '' },
    ]);
  });
});

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const body = request.headers.get('Content-Type') === 'application/json' ? await request.json() : undefined;
  requests.push({ body, method: request.method, pathname: url.pathname, search: url.search });

  if (url.pathname === '/api/v1/social/accounts' && request.method === 'GET') {
    return Response.json({ accounts: [{
      id: 'account-1', platform: 'youtube', username: '@viewpress', displayName: 'Viewpress',
      disabled: false, connectedAt: 1_700_000_000_000,
    }] });
  }
  if (url.pathname === '/api/v1/social/accounts/connections') {
    return Response.json({
      instructions: 'Open this URL to connect YouTube.',
      url: 'https://viewpress.ai/connect/session-1',
    });
  }
  if (url.pathname === '/api/v1/social/posts' && request.method === 'POST') {
    return Response.json({ postId: 'post-created', state: 'scheduled', publishAt: 1_753_056_000_000 });
  }
  if (url.pathname === '/api/v1/social/posts' && request.method === 'GET') {
    return Response.json({ posts: [getPost('post-listed')] });
  }
  if (url.pathname === '/api/v1/social/posts/post-wait') {
    waitRequestCount += 1;
    return Response.json(waitRequestCount === 1 ? getPost('post-wait') : {
      ...getPost('post-wait'),
      platformPostUrl: 'https://youtube.com/shorts/post-wait',
      publishedAt: 1_753_056_100_000,
      state: 'published',
    });
  }
  if (url.pathname.startsWith('/api/v1/social/posts/') && request.method === 'GET') {
    return Response.json(getPost(url.pathname.split('/').at(-1) ?? 'post-get'));
  }
  if (url.pathname === '/api/v1/social/posts/post-cancel' && request.method === 'DELETE') {
    return new Response(null, { status: 204 });
  }
  return Response.json({ message: 'Not found' }, { status: 404 });
}

function getPost(id: string): MockPost {
  return {
    accountId: 'account-1',
    accountUsername: '@viewpress',
    analytics: { comments: 3, likes: 20, shares: 2, views: 400 },
    assetId: 'asset-1',
    caption: 'A new launch',
    id,
    platform: 'youtube',
    publishAt: 1_753_056_000_000,
    state: 'scheduled',
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
