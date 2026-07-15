# Server contracts needed by the CLI

This file records client work that has no matching production server surface.
It is not a claim that these endpoints exist.

## Browser login

The CLI implements a one-time browser login client. The current production
Viewpress server does not implement any `/api/cli/auth/sessions` endpoint or a
verification page, so `viewpress auth login` cannot succeed in production.

The required server contract is:

### Start a session

`POST /api/cli/auth/sessions`

No authentication and no request body. Return HTTP 200 JSON:

```json
{
  "session_id": "opaque public lookup id",
  "poll_token": "high-entropy polling secret",
  "verification_url": "https://viewpress.ai/cli/authorize/SESSION_ID",
  "expires_at": "2026-07-15T12:00:00.000Z",
  "interval_sec": 2
}
```

`verification_url` may contain the public `session_id`. It must not contain the
`poll_token`, an API key, an OAuth access token, or a refresh token in its path,
query, fragment, or encoded form. Responses must use `Cache-Control: no-store`.
The session is short-lived and single-use. Store only a hash of `poll_token`.

### Approve in the browser

The verification URL opens a normal authenticated Viewpress page. The user sees
which CLI session is asking and can approve or deny it. Approval creates a new
`vp_` API key for the signed-in account and binds it to the session. The key is
never rendered in HTML, returned to browser JavaScript, placed in a redirect,
or written to a URL. Denial records a terminal state. Expiry must make later
approval impossible.

### Poll a session

`POST /api/cli/auth/sessions/{sessionId}/poll`

The only credential is:

```text
Authorization: Bearer POLL_TOKEN
```

Do not accept the poll token in a URL or request body. Use constant-time hash
comparison, rate-limit by session and address, and return
`Cache-Control: no-store`.

- Pending: HTTP 202. The body may be empty; the CLI ignores it.
- Approved: HTTP 200
  `{"status":"approved","api_key":"vp_..."}`. This consumes the session and
  the key must never be returned again.
- Denied: non-202 JSON `{"status":"denied"}`.
- Expired: non-202 JSON `{"status":"expired"}`.
- A bad session id or poll token must not reveal whether either part was valid.

The CLI waits `interval_sec` between polls, stops at `expires_at`, validates the
`vp_` key, and stores it using the normal protected config path.

### Why the existing OAuth server is not the CLI flow

Viewpress already has `/oauth/authorize`, `/api/oauth/register`, and
`/api/oauth/token` with PKCE `authorization_code` and `refresh_token` grants.
Dynamic registration currently accepts HTTPS redirect URIs only, so it cannot
register a loopback redirect such as `http://127.0.0.1:{port}/callback`. There
is no device authorization or polling grant.

Those OAuth access tokens start with `vpo_` and have MCP scope. Public v1 auth
accepts `vp_` API keys only. Treating an MCP token as a v1 CLI key would fail
authentication. The one-time session contract above deliberately returns a new
v1 `vp_` key without putting it in a browser URL.

## Transcription status and result

`POST /api/v1/assets/{assetId}/transcription` returns the source asset id and
`pending`, but the public asset response has no transcription state, job id,
words, segments, or transcript URL. The CLI can start transcription but cannot
wait for it or read the result.

A complete surface needs an account-scoped status/result resource with pending,
ready, and terminal error states; a stable transcript schema with text and
timed words or segments; and a polling identifier distinct from a mutable
asset status. Until then, no CLI flag should claim transcription completion.

## Video duration catalog

`GET /api/v1/styles` currently reports `V-ULTRA` duration
`{min:3,max:15}`, while the generation runtime rejects clips below 4 seconds.
The estimate branch returns before runtime duration validation, so the server
can also return a price for a 3-second `V-ULTRA` request that generation will
reject.

The CLI follows the executable generation limit and requires 4..15 seconds for
both estimate and generation. The server should report the same minimum in the
catalog and run model duration validation before returning an estimate.

## Local file upload

The only public ingestion route is `POST /api/v1/media/imports`, which pulls a
public HTTPS URL up to 50 MB. There is no authenticated multipart upload,
presigned upload session, or completion call for a local file. The CLI therefore
does not expose `media upload`.

A future upload contract needs an account- and video-scoped upload session,
declared size and MIME validation before transfer, a short-lived destination
that does not expose the `vp_` key, an integrity check, and an idempotent
completion operation returning the same ready public asset shape as media
import. Server-side limits must be explicit before a command is added.

## Social account correlation

Social account connection creation correctly requires `project_id`. Social post
creation accepts `asset_id`, `platform`, and `connection_id` but no project id;
the server must correlate ownership and platform internally. The public list
surface can list accounts by project, but it offers no direct lookup for a
connection id and no endpoint that explains which project/video mismatch caused
a schedule failure.

The CLI sends the existing contract as-is. Better agent behavior would need a
stable connection lookup or structured mismatch details. The client must not
guess project ownership from ids.

## Pagination

Assets and social posts use only `limit` with a maximum of 200. Voices cap at
50. Projects and videos expose neither a cursor nor a limit. No list response
returns `next_cursor` or `has_more`, so the CLI cannot page through complete
collections.

A future change should add opaque cursor input and `next_cursor` output to each
list without changing item shapes. A missing next cursor must unambiguously mean
the end of the collection.

## Idempotency

No public v1 mutation accepts an idempotency key. After a connection loss, the
CLI cannot tell whether a generation, import, render, account connection, or
social post was created. Automatic mutation retries could duplicate work or
spend credits twice.

A future contract should accept a client-generated idempotency key in a header,
scope it to the authenticated account plus method and route, reject reuse with
a different body, and replay the first status and response for a documented
retention period. The CLI does not retry unknown mutation results until that
contract exists.
