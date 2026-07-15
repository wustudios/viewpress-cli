# Viewpress CLI

Use Viewpress from a terminal or an agent. Create projects and videos, generate
media, render timelines, publish social posts, and download finished assets.

The CLI is TypeScript compiled into one binary with Bun. It does not need Bun or
Node at runtime.

## Install a binary

Open the GitHub release for your version and download one file:

- `viewpress-darwin-arm64` for Apple silicon
- `viewpress-darwin-x64` for Intel Macs
- `viewpress-linux-arm64` for ARM64 Linux
- `viewpress-linux-x64` for x64 Linux
- `viewpress-windows-x64.exe` for x64 Windows

Check the file against `SHA256SUMS`. On macOS or Linux, make it executable and
move it onto your path:

```sh
chmod +x viewpress-darwin-arm64
mv viewpress-darwin-arm64 /usr/local/bin/viewpress
viewpress --version
```

Windows users can rename the file to `viewpress.exe` and put its folder on
`PATH`.

## Sign in

Create a `vp_` API key in the Viewpress app. For an agent or CI job, use the
environment:

```sh
export VIEWPRESS_API_KEY='vp_...'
viewpress auth status
```

To save a key locally, pipe it over stdin. Keys are never accepted as command
arguments.

```sh
printf '%s' "$VIEWPRESS_API_KEY" | viewpress auth set-key
```

The config file is written with user-only permissions on macOS and Linux. Set
`VIEWPRESS_CONFIG_DIR` to choose another config folder.

`viewpress auth login` contains the client for a safe, one-time browser flow.
It does not work against the current production server: the required browser
session endpoints and approval page do not exist yet. Use an API key until the
[server contract](docs/server-contracts.md) is implemented.

## A quick flow

```sh
viewpress projects create --name "Launch clips" --json
viewpress videos create --project-id PROJECT_ID --name "First cut" --json
viewpress images generate \
  --video-id VIDEO_ID \
  --name "Opening frame" \
  --prompt "A red paper kite above a quiet beach" \
  --json
viewpress assets wait ASSET_ID --json
viewpress assets download ASSET_ID --output opening.png
```

Generation commands return a pending asset. Use `viewpress assets get`,
`assets wait`, then `assets download`. Social posts have the same pattern with
`social posts get` and `social posts wait`.

See the [command reference](docs/commands.md) for every flag and the [HTTP API
reference](docs/api.md) for the server surface.

## Output and automation

Human output goes to stdout. Errors and interactive wait notices go to stderr.
`--json` writes one success document to stdout and disables interaction:

```json
{"ok":true,"data":{"assetId":"...","status":"pending"}}
```

JSON errors write one document to stderr:

```json
{"ok":false,"error":{"type":"usage_error","message":"..."}}
```

Use `--non-interactive` to stop browser opens, prompts, and progress notices
without changing human success output. Global flags may appear before or after
the command:

- `--json`
- `--non-interactive`
- `--api-url <url>`
- `--timeout <seconds>` (default `30`)
- `--help`, `-h`
- `--version`, `-V`

Environment overrides are `VIEWPRESS_API_KEY`, `VIEWPRESS_API_URL`,
`VIEWPRESS_TIMEOUT`, and `VIEWPRESS_CONFIG_DIR`. The API URL order is command
flag, environment, config file, then `https://viewpress.ai/api/v1`. The API key
order is environment, then config file.

Exit codes are stable: `0` success, `1` API or terminal job failure, `2` usage
or config, `3` authentication, `4` timeout, `5` transport, `6` file I/O, and
`130` interruption.

## Build and release

Source builds need Node 22, npm, and Bun 1.3.14.

```sh
npm ci
npm run check
npm run build:native
npm run smoke
```

`npm run build` writes all five release binaries to `dist/`.
`npm run release:checksums` writes `dist/SHA256SUMS`. Tags matching `v*` run the
full checks, build all targets, and attach the raw binaries and checksums to a
GitHub release.
