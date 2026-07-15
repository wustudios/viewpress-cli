import { platform } from 'node:process';

export async function openBrowser(url: string): Promise<void> {
  const command = getOpenCommand(url);
  const childProcess = Bun.spawn(command, { stderr: 'ignore', stdout: 'ignore' });
  const exitCode = await childProcess.exited;

  if (exitCode !== 0) {
    throw new Error('Could not open the browser. Open the verification URL shown above.');
  }
}

function getOpenCommand(url: string): string[] {
  if (platform === 'darwin') {
    return ['open', url];
  }

  if (platform === 'win32') {
    return ['rundll32.exe', 'url.dll,FileProtocolHandler', url];
  }

  return ['xdg-open', url];
}
