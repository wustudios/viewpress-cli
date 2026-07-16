export function showAuthHelp(): void {
  process.stdout.write(`Usage: viewpress auth <command>

Commands:
  login    Sign in through a browser (requires server support not available in production)
  set-key  Save a vp_ API key from stdin or VIEWPRESS_API_KEY
  status   Show the active server and authentication source
  logout   Remove the stored API key

Browser login needs POST /api/cli/auth/sessions,
POST /api/cli/auth/sessions/{session_id}/poll, and a verification UI.
The current Viewpress production server does not expose this contract yet.

Run 'viewpress auth <command> --help' for full options.
`);
}
