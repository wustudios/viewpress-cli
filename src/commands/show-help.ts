export function showHelp(): void {
  process.stdout.write(`Viewpress CLI

Usage: viewpress [options] [command]

Options:
  -V, --version  Show the installed version
  -h, --help     Show help
`);
}
