export function showAuthHelp(): void {
  process.stdout.write(`Usage: viewpress auth <command>

Commands:
  login    Sign in through a browser
  set-key  Read a vp_ API key from stdin or VIEWPRESS_API_KEY
  status   Show the active server and authentication source
  logout   Remove the stored API key
`);
}
