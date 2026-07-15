export function showHelp(): void {
  process.stdout.write(`Viewpress CLI

Usage: viewpress [options] [command]

Commands:
  auth                         Sign in or manage the stored API key
  projects list|create         List or create projects
  videos <command>             Manage videos and generate video assets
  credits get                  Show the credit balance
  styles list                  List generation styles and image models
  voices list                  List saved voices and built-in presets
  images generate|edit         Generate or edit images
  speech generate              Generate speech audio
  music generate               Generate music
  sfx generate                 Generate sound effects

Options:
  -V, --version  Show the installed version
  -h, --help     Show help
`);
}
