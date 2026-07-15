# Viewpress CLI command reference

Commands use `viewpress [global options] <command>`. Global options may appear
before or after a command.

## Global options

| Option | Meaning |
| --- | --- |
| `--json` | Write one JSON result and disable interaction. |
| `--non-interactive` | Do not open a browser, prompt, or write progress notices. |
| `--api-url <url>` | Override `VIEWPRESS_API_URL` and the stored URL. HTTPS is required except for localhost. |
| `--timeout <seconds>` | HTTP timeout. Default `30`; `VIEWPRESS_TIMEOUT` supplies the default. |
| `-h`, `--help` | Show help. |
| `-V`, `--version` | Show the installed version. |

`VIEWPRESS_API_KEY` overrides the stored key. `VIEWPRESS_CONFIG_DIR` overrides
the system config folder. The default API URL is
`https://viewpress.ai/api/v1`.

The default config file is `~/Library/Application Support/Viewpress/config.json`
on macOS, `%APPDATA%\Viewpress\config.json` on Windows, and
`${XDG_CONFIG_HOME:-~/.config}/viewpress/config.json` on Linux. On macOS and
Linux, the CLI sets the directory to mode `0700` and the file to `0600`.

## Authentication

| Command | Arguments and behavior |
| --- | --- |
| `viewpress auth login` | Open the one-time browser flow. This client is implemented, but the current production server does not expose the required endpoints. It is rejected in noninteractive mode. |
| `viewpress auth set-key` | Read a `vp_` key from `VIEWPRESS_API_KEY` or stdin and save it. No key argument is accepted. |
| `viewpress auth status` | Show the API URL and whether the key comes from the environment or config file. Returns exit `3` when unsigned in. |
| `viewpress auth logout` | Remove the stored key. It does not unset `VIEWPRESS_API_KEY`. |

Auth commands accept no command-specific flags. Global `--json` gives JSON
output for `set-key`, `status`, and `logout`. Browser login is unavailable with
`--json` because JSON mode is noninteractive. See [server
contracts](server-contracts.md#browser-login).

## Projects, videos, credits, styles, and voices

| Command | Required | Optional and defaults |
| --- | --- | --- |
| `viewpress projects list` | — | `--json` |
| `viewpress projects create` | `--name <1..120 chars>` | `--json` |
| `viewpress videos list` | `--project-id <id>` | `--json` |
| `viewpress videos create` | `--project-id <id>`, `--name <1..120 chars>` | `--json` |
| `viewpress credits get` | — | `--json` |
| `viewpress styles list` | — | `--json` |
| `viewpress voices list` | `--project-id <id>` | `--query <text>`, `--gender <male\|female\|neutral>`, `--limit <1..50>` (server default `20`), `--json` |

## Images

`viewpress images generate` requires `--video-id <id>`, `--name <1..120
chars>`, and one of `--prompt <text>` or `--prompt-file <path|->`. The prompt
must have at least 3 characters.

Optional flags:

- `--aspect-ratio <1:1|9:16|16:9|4:5>`; default `9:16`
- `--model <I-FAST|I-PRO|I-REALISTIC>`; default `I-PRO`
- `--json`

`viewpress images edit` has the same required values and aspect ratios. It also
requires 1 to 6 repeated `--reference-asset-id <id>` flags. It does not accept
`--model`; the server selects the edit model. Its aspect ratio also defaults to
`9:16`, and `--json` is optional.

## Video generation

`viewpress videos generate` and `viewpress videos estimate` accept the same
input. Both require:

- `--video-id <id>`
- `--name <1..120 chars>`
- one of `--prompt <text>` or `--prompt-file <path|->`; at least 3 characters
- `--model <V-STANDARD|V-LITE|V-PRO|V-PRO-TRANSITION|V-ULTRA|V-UGC>`
- `--duration-sec <1..15>`

Optional flags:

- `--aspect-ratio <1:1|9:16|16:9>`; default `9:16`
- `--with-audio` or `--no-audio`; default `--with-audio`
- `--start-image-asset-id <id>`
- `--end-image-asset-id <id>`
- repeated `--reference-image-asset-id <id>`; CLI cap 9
- repeated `--reference-video-asset-id <id>`; CLI cap 3
- repeated `--reference-audio-asset-id <id>`; CLI cap 3
- `--negative-prompt <text>`
- `--json`

The server applies tighter per-model rules. In particular, `V-LITE` accepts
durations 4, 6, or 8; `V-UGC` accepts 4, 6, 8, or 10; and the style catalog
defines which references each model accepts. `estimate` returns
`{status:"estimate",credits}` and does not create an asset.

## Video style tools

`viewpress videos motion-transfer` requires `--video-id`, `--name`,
`--image-asset-id`, and `--motion-video-asset-id`. Optional:

- `--character-orientation <image|video>`; default `video`
- `--prompt <text>` or `--prompt-file <path|->`; maximum 2,500 characters
- `--keep-original-sound` or `--no-original-sound`; default keep
- `--json`

`viewpress videos talking-image` requires `--video-id`, `--name`,
`--image-asset-id`, and `--audio-asset-id`. Optional:

- `--aspect-ratio <1:1|9:16|16:9>`; default `9:16`
- `--resolution <360p|480p|540p|720p|1080p>`; default `720p`
- `--caption` or `--no-caption`; default no caption
- `--talking-style <stable|expressive>`; default `stable`
- `--json`

`viewpress videos ugc-ad` requires `--video-id`, `--name`,
`--subject-description <at least 10 chars>`, `--dialogue <2..400 chars>`,
`--duration-sec <4|6|8|10>`, and repeated `--reference-image-asset-id`. Use 1
to 7 images, or 1 to 5 when `--reference-video-asset-id` is present. Optional:

- `--reference-video-asset-id <id>`
- `--scene-notes <text>`
- `--voice-notes <text>`
- `--camera-notes <text>`
- `--aspect-ratio <9:16|16:9>`; default `9:16`
- `--json`

`viewpress videos timelapse-scene` requires `--video-id`, `--name`,
`--step-description <at least 10 chars>`, and `--start-image-asset-id`.
Optional: `--worker-description <text>`, `--setting-notes <text>`,
`--aspect-ratio <9:16|16:9>` (default `9:16`), and `--json`. The result contains
both the pending video asset and an `endFrameAssetId` for the next step.

All style-tool names are 1 to 120 characters.

## Speech, music, and sound effects

`viewpress speech generate` requires `--video-id`, `--name`, and one of
`--text <text>` or `--text-file <path|->`. Text must have 1 to 10,000
characters. Choose at most one of `--voice-preset` and `--voice-record-id`.

Optional flags:

- `--voice-preset <name>`: `Wise_Woman`, `Friendly_Person`,
  `Inspirational_girl`, `Deep_Voice_Man`, `Calm_Woman`, `Casual_Guy`,
  `Lively_Girl`, `Patient_Man`, `Young_Knight`, `Determined_Man`,
  `Lovely_Girl`, `Decent_Boy`, `Imposing_Manner`, `Elegant_Man`, `Abbess`,
  `Sweet_Girl_2`, or `Exuberant_Girl`
- `--voice-record-id <id>`
- `--emotion <happy|sad|angry|fearful|disgusted|surprised|neutral>`
- `--speed <0.5..2>`
- `--pitch <-12..12>`; integer
- `--vol <0.01..10>`
- `--english-normalization` or `--no-english-normalization`
- `--language-boost <language>`
- `--json`

`viewpress music generate` requires `--video-id`, `--name`, one of
`--prompt <text>` or `--prompt-file <path|->`, `--style <at least 2 chars>`, and
`--duration-seconds <3..480>`. Optional: `--instrumental-only` or
`--no-instrumental-only` (default instrumental), `--description <text>`, and
`--json`.

`viewpress sfx generate` requires `--video-id`, `--name`, and one of
`--prompt <text>` or `--prompt-file <path|->`. Optional:
`--duration-seconds <0.5..10>` (default `2`), `--prompt-influence <0..1>`
(default `0.5`), `--description <text>`, and `--json`.

Audio names have 1 to 120 characters. Music and SFX prompts need at least 3.

## Renders and imports

`viewpress renders create` requires `--video-id`, `--name <1..120 chars>`, and
`--timeline <file|->`. The timeline file must contain a JSON object with at
least one `tracks` entry and a positive integer `durationInFrames`. Optional
`fps` must be a positive integer. `backgroundColor` and other timeline fields
pass through to the server. `--json` is optional.

`viewpress media import` requires `--video-id` and `--url <https-url>`.
The URL must be public HTTPS without embedded credentials. Loopback, private,
link-local, benchmark, carrier-grade NAT, multicast, and private IPv6
hosts are rejected. Optional: `--name <1..120 chars>` and `--json`. A successful
import is ready immediately and returns `assetId`, `status`, `kind`, and
`mimeType`.

## Assets

| Command | Required | Optional and defaults |
| --- | --- | --- |
| `viewpress assets list` | `--video-id <id>` | `--kind <image\|video\|audio\|sfx\|music\|render>`, `--limit <1..200>` (default `50`), `--json` |
| `viewpress assets get` | `<asset-id>` | `--json` |
| `viewpress assets wait` | `<asset-id>` | `--wait-timeout <seconds>` (default `600`), `--poll-interval <seconds>` (default `2`), `--json` |
| `viewpress assets download` | `<asset-id>`, `--output <path|->` | `--force`; global `--json` is allowed only for file output |
| `viewpress assets smooth` | `<asset-id>` | `--json` |
| `viewpress assets humanize` | `<asset-id>` | `--json` |
| `viewpress assets transcribe` | `<asset-id>` | `--json`; the API does not expose completion or transcript data |

`viewpress assets add-captions <asset-id>` accepts:

- `--preset-id <basic|plain_white|minima|viewpress|punch|wrap|outline>`; default `basic`
- `--font-size <10..200>`; default `80`
- `--color <color>`
- `--font-family <family>`
- `--font-weight <number>`
- `--text-transform <uppercase|lowercase|none>`
- `--alignment <top|middle|bottom>`; default `bottom`
- `--karaoke` or `--no-karaoke`; default karaoke
- `--animated` or `--no-animated`; default animated
- `--words-at-a-time <one|short|long>`; default `short`
- `--json`

`viewpress assets upscale <asset-id>` accepts `--width <320..3840>` and
`--height <320..3840>` together, `--output-frame-rate <24..60>`, and `--json`.
All numeric values are integers.

`viewpress assets remove-background <asset-id>` accepts
`--subject-is-person|--no-subject-is-person` (default true),
`--refine-foreground-edges|--no-refine-foreground-edges` (default true),
`--output-codec <vp9|h264>` (default `vp9`), and `--json`.

`viewpress assets enhance-audio <asset-id>` accepts
`--remove-noise|--no-remove-noise`, `--normalize|--no-normalize`, and
`--studio-sound|--no-studio-sound`. All three default true. `--json` is
optional.

Asset response `kind` is any server string, including `slideshow`. Only the
`assets list --kind` filter is restricted to the six values shown above.

`assets wait` succeeds only at `ready`. It fails at `error`,
`validation_error`, or `canceled`, and times out with exit `4`. Downloads use
the server asset URL without adding the API key. They require HTTPS, except for
local test loopback URLs. File downloads use a temporary file and rename only
after the stream finishes. `--output -` writes raw bytes to stdout and cannot
be combined with JSON output.

## Social

| Command | Required | Optional and defaults |
| --- | --- | --- |
| `viewpress social accounts list` | `--project-id <id>` | `--json` |
| `viewpress social accounts connect` | `--project-id <id>`, `--platform <tiktok\|instagram\|youtube>` | `--json` |
| `viewpress social posts create` | `--asset-id <id>`, `--platform <tiktok\|instagram\|youtube>`, `--connection-id <id>` | `--publish-at <ISO date with offset>`, `--caption <max 2200 chars>`, `--options <file|->`, `--json` |
| `viewpress social posts list` | `--project-id <id>` | `--limit <1..200>` (default `50`), `--json` |
| `viewpress social posts get` | `<post-id>` | `--json` |
| `viewpress social posts wait` | `<post-id>` | `--wait-timeout <seconds>` (default `600`), `--poll-interval <seconds>` (default `2`), `--json` |
| `viewpress social posts cancel` | `<post-id>` | `--json` |

`--options` is a JSON object containing fields for the selected platform. The
CLI sends YouTube fields under `options.youtube` and TikTok fields under
`options.tiktok`. YouTube fields are `title` (max 100), `privacy_status`
(`public`, `unlisted`, or `private`; default `public`), `tags` (up to 30),
`category_id`, and `made_for_kids`. TikTok fields are `privacy_level`
(`PUBLIC_TO_EVERYONE`, `MUTUAL_FOLLOW_FRIENDS`,
`FOLLOWER_OF_CREATOR`, or `SELF_ONLY`), `title` (max 2,200),
`disable_comment`, `disable_duet`, `disable_stitch`, `brand_content_toggle`,
`brand_organic_toggle`, and `is_aigc`. Instagram currently accepts an empty
object only.

`social posts wait` succeeds at `published`, fails at `failed` or `canceled`,
and times out with exit `4`.

## File and stdin input

`--prompt-file -`, `--text-file -`, `--timeline -`, and `--options -` read the
whole value from stdin. A command can use one stdin-backed input. A direct
`--prompt` conflicts with `--prompt-file`; `--text` conflicts with
`--text-file`. `auth set-key` also reads stdin and accepts no key argument.

## Output contract

Human success data is written to stdout. Empty lists print a short `No ...`
line. Interactive wait progress and logout environment warnings use stderr.
Errors always use stderr.

JSON success is one line:

```json
{"ok":true,"data":{}}
```

JSON error is one line on stderr:

```json
{"ok":false,"error":{"type":"usage_error","message":"..."}}
```

API errors may add `status` and `details` to `error`. JSON mode writes no
progress lines. Exit codes are `0` success, `1` API/terminal/unexpected error,
`2` usage or config, `3` authentication, `4` timeout, `5` transport, `6` file
I/O, and `130` interruption.
