import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platform } from 'node:process';

interface CliResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

test('sets, reports, and removes stored credentials through the CLI', async () => {
  const configDirectory = await mkdtemp(join(tmpdir(), 'viewpress-cli-auth-'));

  try {
    const setKey = await runCli(
      configDirectory,
      ['--api-url', 'https://viewpress.ai/api/v1', '--json', 'auth', 'set-key'],
      'vp_test_key\n',
    );
    const status = await runCli(configDirectory, ['--json', 'auth', 'status']);

    expect(setKey).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: '{"ok":true,"data":{"apiUrl":"https://viewpress.ai/api/v1","saved":true}}\n',
    });
    expect(setKey.stdout).not.toContain('vp_test_key');
    expect(status).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: '{"ok":true,"data":{"apiUrl":"https://viewpress.ai/api/v1","authenticated":true,"source":"file"}}\n',
    });
    expect(await readFile(join(configDirectory, 'config.json'), 'utf8')).toContain('vp_test_key');
    await expectPrivateModes(configDirectory);

    const loopback = await runCli(configDirectory, [
      '--api-url', 'http://localhost:3000/api/v1', '--json', 'auth', 'status',
    ]);
    const remoteHttp = await runCli(configDirectory, [
      '--api-url', 'http://viewpress.ai/api/v1', '--json', 'auth', 'status',
    ]);
    const loopbackFtp = await runCli(configDirectory, [
      '--api-url', 'ftp://localhost/api/v1', '--json', 'auth', 'status',
    ]);

    expect(loopback).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: '{"ok":true,"data":{"apiUrl":"http://localhost:3000/api/v1","authenticated":true,"source":"file"}}\n',
    });
    expect(remoteHttp).toEqual({
      exitCode: 2,
      stderr: '{"ok":false,"error":{"type":"usage_error","message":"The Viewpress API URL must use HTTPS, except HTTP is allowed for localhost and 127.0.0.1."}}\n',
      stdout: '',
    });
    expect(loopbackFtp).toEqual({
      exitCode: 2,
      stderr: '{"ok":false,"error":{"type":"usage_error","message":"The Viewpress API URL must use HTTPS, except HTTP is allowed for localhost and 127.0.0.1."}}\n',
      stdout: '',
    });

    const logout = await runCli(configDirectory, ['--json', 'auth', 'logout']);

    expect(logout).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: '{"ok":true,"data":{"removed":true}}\n',
    });
    expect(await readFile(join(configDirectory, 'config.json'), 'utf8')).not.toContain('vp_test_key');
  } finally {
    await rm(configDirectory, { force: true, recursive: true });
  }
});

async function runCli(
  configDirectory: string,
  arguments_: string[],
  stdin?: string,
): Promise<CliResult> {
  const environment = { ...process.env, VIEWPRESS_CONFIG_DIR: configDirectory };
  Reflect.deleteProperty(environment, 'VIEWPRESS_API_KEY');
  Reflect.deleteProperty(environment, 'VIEWPRESS_API_URL');
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

async function expectPrivateModes(configDirectory: string): Promise<void> {
  if (platform === 'win32') {
    return;
  }

  const directoryStats = await stat(configDirectory);
  const fileStats = await stat(join(configDirectory, 'config.json'));
  expect(directoryStats.mode & 0o777).toBe(0o700);
  expect(fileStats.mode & 0o777).toBe(0o600);
}
