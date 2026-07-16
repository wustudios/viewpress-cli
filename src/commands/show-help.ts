export function showHelp(): void {
  process.stdout.write(`Viewpress CLI

Usage: viewpress [options] <command>

Commands:
  auth      Manage credentials
  projects  List or create projects
  videos    Manage videos and generate video assets
  credits   Show the credit balance
  styles    List generation styles and image models
  voices    List saved voices and built-in presets
  images    Generate or edit images
  assets    List, inspect, transform, or download assets
  renders   Render a timeline
  social    Connect accounts and publish social posts
  media     Import media from a public URL
  speech    Generate speech audio
  music     Generate music
  sfx       Generate sound effects

Options:
  --json                 Write one JSON document and disable interaction
  --non-interactive      Never open a browser, prompt, or write progress
  --api-url <url>        Override VIEWPRESS_API_URL and stored configuration
  --timeout <seconds>    Request timeout (default: 30; env: VIEWPRESS_TIMEOUT)
  -V, --version          Show the installed version
  -h, --help             Show help

Run 'viewpress <command> --help' for full options.
`);
}
