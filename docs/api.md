# Viewpress public API v1

Base URL: `https://viewpress.ai/api/v1`

Send `Authorization: Bearer vp_...` and `Accept: application/json` on every
request. JSON requests also send `Content-Type: application/json`. API keys can
be created in the Viewpress app.

Most generation and transform POSTs return HTTP 200 with
`{assetId,status:"pending"}`. Poll `GET /assets/{assetId}` until `ready` or a
terminal status. This rule has important exceptions: video estimation returns
`{status:"estimate",credits}` without doing work, and media import returns a
ready asset with `kind` and `mimeType`. Project/video creation, social account
connection, and social post creation also return their own synchronous result.

There are 34 HTTP operations in 30 v1 route files.

## Projects and videos

| Operation | Request and defaults | HTTP 200 response |
| --- | --- | --- |
| `GET /projects` | No input. | `{projects:[{id,name,createdAt}]}`; `createdAt` is epoch milliseconds. |
| `POST /projects` | `{name}`; name 1..120 characters. | `{id,name}` |
| `GET /videos?project_id=...` | `project_id` is required. | `{videos:[{id,name,url,createdAt}]}`; `createdAt` is an ISO datetime string. |
| `POST /videos` | `{project_id,name}`; both required, name 1..120. | `{id,name,url}` |
| `GET /credits` | No input. | `{total,available,held}` numbers. |
| `GET /styles` | No input. | `{videoStyles,imageModels}`. A video style has `code`, `label`, `useFor`, `durationSec:{min,max}`, `creditsPerSecond`, and input support. An image model has `code`, `useFor`, and `credits`. |
| `GET /voices?project_id=...&query=...&gender=...&limit=...` | `project_id` required; `query` optional; `gender` is `male`, `female`, or `neutral`; `limit` 1..50, default 20. | `{voices:[{id,name,description?,gender?,age?,language?,type?}],presets:[string]}` |

Project ownership is checked for project-scoped lists. A missing or foreign
project is reported as not found.

## Images and video

| Operation | JSON request and defaults | HTTP 200 response |
| --- | --- | --- |
| `POST /images/generations` | `{video_id,name,prompt,aspect_ratio?,model?}`. Name 1..120; prompt at least 3; ratio `1:1`, `9:16`, `16:9`, or `4:5`, default `9:16`; model `I-FAST`, `I-PRO`, or `I-REALISTIC`, default `I-PRO`. | `{assetId,status:"pending"}` |
| `POST /images/edits` | `{video_id,name,prompt,reference_asset_ids,aspect_ratio?}`. References 1..6; same name, prompt, ratio rules; ratio default `9:16`. | `{assetId,status:"pending"}` |
| `POST /videos/generations` | `{video_id,name,prompt,model,duration_sec,aspect_ratio?,with_audio?,start_image_asset_id?,end_image_asset_id?,reference_image_asset_ids?,reference_video_asset_ids?,reference_audio_asset_ids?,negative_prompt?,estimate_only?}`. Ratio default `9:16`; audio default true; reference schema caps 9 images, 3 videos, 3 audio; duration schema 1..15; estimate default false. | Generate: `{assetId,status:"pending"}`. Estimate: `{status:"estimate",credits}`. |
| `POST /videos/motion-transfers` | `{video_id,name,image_asset_id,motion_video_asset_id,character_orientation?,prompt?,keep_original_sound?}`. Orientation `image` or `video`, default `video`; prompt max 2,500; keep sound default true. | `{assetId,status:"pending"}` |
| `POST /videos/talking-images` | `{video_id,name,image_asset_id,audio_asset_id,aspect_ratio?,resolution?,caption?,talking_style?}`. Ratio default `9:16`; resolution `360p`, `480p`, `540p`, `720p`, or `1080p`, default `720p`; caption default false; style `stable` or `expressive`, default `stable`. | `{assetId,status:"pending"}` |
| `POST /videos/ugc-ads` | `{video_id,name,subject_description,dialogue,reference_image_asset_ids,reference_video_asset_id?,scene_notes?,voice_notes?,camera_notes?,duration_sec,aspect_ratio?}`. Subject at least 10; dialogue 2..400; duration 4/6/8/10; ratio `9:16` or `16:9`, default `9:16`; 1..7 images, reduced to 5 when a reference video is used. | `{assetId,status:"pending"}` |
| `POST /videos/timelapse-scenes` | `{video_id,name,step_description,start_image_asset_id,worker_description?,setting_notes?,aspect_ratio?}`. Step at least 10; ratio `9:16` or `16:9`, default `9:16`; generated scene duration is 8 seconds. | `{assetId,endFrameAssetId,status:"pending"}` |

All names above are 1..120 characters. Input assets must be ready and belong to
the requested video or project as enforced by each route.

The top-level video generation schema deliberately has broad reference caps.
The server then applies model rules from `GET /styles`: `V-STANDARD`, `V-LITE`,
`V-PRO`, `V-PRO-TRANSITION`, `V-ULTRA`, and `V-UGC` accept different input
types and durations. Examples: `V-PRO-TRANSITION` requires start and end images;
`V-LITE` start-to-end is fixed at 8 seconds; `V-PRO` references require 2..5
images of one subject; only `V-ULTRA` accepts general reference video/audio;
and `V-UGC` accepts 4/6/8/10 seconds. Clients should read the style catalog and
must still handle a validation error. The request schema alone is not the full
model contract.

## Audio and rendering

| Operation | JSON request and defaults | HTTP 200 response |
| --- | --- | --- |
| `POST /speech` | `{video_id,name,text,voice_record_id?,voice_preset?,emotion?,speed?,pitch?,vol?,english_normalization?,language_boost?}`. Text 1..10,000; speed 0.5..2; integer pitch -12..12; volume 0.01..10; emotion `happy`, `sad`, `angry`, `fearful`, `disgusted`, `surprised`, or `neutral`. Use one voice source. | `{assetId,status:"pending"}` |
| `POST /music` | `{video_id,name,prompt,style,duration_seconds,instrumental_only?,description?}`. Prompt at least 3; style at least 2; duration 3..480; instrumental default true. | `{assetId,status:"pending"}` |
| `POST /sfx` | `{video_id,name,prompt,duration_seconds?,prompt_influence?,description?}`. Prompt at least 3; duration 0.5..10, default 2; influence 0..1, default 0.5. | `{assetId,status:"pending"}` |
| `POST /renders` | `{video_id,name,timeline}`. Timeline requires nonempty `tracks` and positive integer `durationInFrames`; optional `fps` is a positive integer; optional `backgroundColor`; extra timeline fields pass through. | `{assetId,status:"pending"}` |
| `POST /media/imports` | `{video_id,url,name?}`. URL is an image/video/audio URL; name 1..120; server requires HTTPS, a public host, an accepted MIME type, and at most 50 MB. | `{assetId,status:"ready",kind,mimeType}` |

The render timeline is the Viewpress `TimelineComposition` tracks model. Track
order sets visual stacking. Clip times use seconds; root duration uses frames.
Asset URLs are resolved by the server from each clip's `assetId`.

## Assets and transforms

The public asset shape is:

```text
{id,name?,kind,status,url?,previewUrl?,mimeType?,width?,height?,
 durationMs?,progress?,error?,createdAt}
```

`kind` and `status` are server strings. In particular, valid responses may use
`kind:"slideshow"`. URLs are exposed when available; the primary URL is
normally set only for ready assets.

| Operation | Request and defaults | Success response |
| --- | --- | --- |
| `GET /assets/{assetId}` | Path id required. | HTTP 200 public asset. |
| `GET /assets?video_id=...&kind=...&limit=...` | `video_id` required; filter kind is only `image`, `video`, `audio`, `sfx`, `music`, or `render`; limit 1..200, default 50. | HTTP 200 `{assets:[public asset]}`. Response kinds remain unrestricted strings. |
| `POST /assets/{assetId}/captions` | Body fields: `preset_id` default `basic`; `font_size` 10..200 default 80; optional `color`, `font_family`, numeric `font_weight`, and `text_transform` (`uppercase`, `lowercase`, `none`); `alignment` default `bottom`; `karaoke` default true; `animated` default true; `words_at_a_time` default `short` (`one`, `short`, `long`). | HTTP 200 `{assetId,status:"pending"}` |
| `POST /assets/{assetId}/smooth` | No body. | HTTP 200 `{assetId,status:"pending"}` |
| `POST /assets/{assetId}/humanize` | No body. | HTTP 200 `{assetId,status:"pending"}` |
| `POST /assets/{assetId}/upscale` | `{output_resolution?:{width,height},output_frame_rate?}`. Width and height integers 320..3840; frame rate integer 24..60. | HTTP 200 `{assetId,status:"pending"}` |
| `POST /assets/{assetId}/remove-background` | `{subject_is_person?,refine_foreground_edges?,output_codec?}`. Booleans default true; codec `vp9` or `h264`, default `vp9`. | HTTP 200 `{assetId,status:"pending"}` |
| `POST /assets/{assetId}/enhance-audio` | `{remove_noise?,normalize?,studio_sound?}`; all default true. | HTTP 200 `{assetId,status:"pending"}` |
| `POST /assets/{assetId}/transcription` | No body. | HTTP 200 `{assetId,status:"pending"}` |

Video transforms require a ready `video` or `render` asset. The transcription
route starts work on the source asset, but v1 has no transcription-specific
poll or transcript-result operation. The normal asset response does not expose
transcription progress or words. A client can report only that transcription
started.

## Social accounts and posts

| Operation | Request and defaults | Success response |
| --- | --- | --- |
| `GET /social/accounts?project_id=...` | `project_id` required. | HTTP 200 `{accounts:[{id,platform,username?,displayName?,disabled?,connectedAt}]}`. Platform is TikTok, Instagram, or YouTube. |
| `POST /social/accounts/connections` | `{project_id,platform}`; both required. | HTTP 200 `{url,instructions}`. The URL starts the platform account connection, not CLI authentication. |
| `POST /social/posts` | `{asset_id,platform,connection_id,publish_at?,caption?,options?}`. `publish_at` is an ISO 8601 UTC datetime ending in `Z` and no more than one year ahead; omitted means now; caption max 2,200. | HTTP 200 `{postId,state:"scheduled",publishAt}`; `publishAt` is epoch milliseconds. |
| `GET /social/posts?project_id=...&limit=...` | `project_id` required; limit 1..200, default 50. | HTTP 200 `{posts:[public social post]}`. |
| `GET /social/posts/{postId}` | Path id required. | HTTP 200 public social post. |
| `DELETE /social/posts/{postId}` | Path id required; only a cancelable scheduled post succeeds. | HTTP 204 with no body. |

A public social post is
`{id,platform,accountId,accountUsername?,assetId,state,publishAt,publishedAt?,caption?,platformPostUrl?,errorMessage?,analytics?}`.
State is `draft`, `scheduled`, `publishing`, `published`, `failed`, or
`canceled`. Analytics may contain `views`, `likes`, `comments`, and `shares`.

YouTube `options` may contain `title` (max 100), `privacy_status` (default
`public`), up to 30 `tags`, `category_id`, and `made_for_kids`. TikTok options
may contain `privacy_level`, `title` (max 2,200), `disable_comment`,
`disable_duet`, `disable_stitch`, `brand_content_toggle`,
`brand_organic_toggle`, and `is_aigc`. Instagram has no defined option fields.

The create-post request contains no `project_id`. The server correlates the
asset and social connection internally and rejects invalid ownership or
platform combinations. The account connection request does require
`project_id`.

## Errors, limits, and retries

Errors are JSON with at least `{type,message}`. Common HTTP statuses are 400
validation, 401 missing or invalid key, 402 insufficient credits (often with
`creditsRequired`), 404 missing or foreign resource, and 429 rate limit. The
limit is 120 requests per minute per API key. The API does not currently return
standard rate-limit headers or a documented retry delay.

List operations are bounded but not cursor-paginated: assets and social posts
cap at 200, voices at 50, while projects and videos have no client cursor or
limit. Results beyond those one-page surfaces cannot be traversed through v1.

No v1 mutation accepts an idempotency key. A client cannot safely prove whether
a timed-out generation, import, render, connection, or social-post creation was
accepted. Do not blindly retry mutations after an unknown transport result.
Social publishing jobs themselves run once to reduce duplicate platform posts,
but that is not a request-level idempotency contract.

Credits are debited when provider-backed work starts and are intended to be
refunded when that work fails. Polling should stop at `ready`, `error`,
`validation_error`, or `canceled`; clients must tolerate other server status
strings because the public asset schema does not enumerate them.

Known server gaps and proposed contracts are tracked in [server
contracts](server-contracts.md).
