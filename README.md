# formbase Make integration

Git-tracked mirror of formbase custom app configuration for [Make Developer Hub](https://developers.make.com/custom-apps-documentation/). Make hosts and executes these definitions; this repository supplies reviewable IML JSON, contract tests, and deployment instructions.

## Integration surface

- OAuth 2.0 authorization-code connection with mandatory PKCE S256
- Rotating access and refresh tokens (`api:read api:write offline_access`)
- Workspace-scoped, cursor-paginated form picker
- Attached dedicated webhook with automatic subscribe/unsubscribe
- `submission_created` and `submission_abandoned` events, with required 12-hour, 1-day, 3-day, or 1-week idle windows for abandoned submissions
- Dynamic sample payload from `submissions.sample`
- Dynamic output interface from `fields.list`, so every answer is mappable under its own field key: a choice answer as its option key, a multi-choice answer as a list of keys, a matrix as one item per row, a repeating group as an array of rows
- Universal **Make an API Call** module for other formbase JSON-RPC methods
- Unsigned webhook, by necessity: a Make custom-app webhook sees only the parsed `body`, `headers` and `query`, never the raw bytes, and holds no per-subscription secret at receive time, so `X-formbase-Signature` cannot be verified here. Deliveries are protected by the unguessable `hook.make.com` URL over HTTPS; Zapier and n8n verify signatures because their runtimes expose the raw body
- Every event is the formbase envelope `{ id, type, createdAt, apiVersion, test, data }`: `data.answers` holds each answer once under its field key, `data.display` the readable text under the same key, `data.submission` the email/date/PDF/language
- Event `type` values: `submission.completed`, `submission.updated`, and `submission.abandoned`

Implementation follows current formbase [n8n](https://github.com/formbaseso/n8n-nodes-formbase) and [Zapier](https://github.com/formbaseso/formbase-zapier) integrations. Canonical API contract lives in [formbaseso/formbase](https://github.com/formbaseso/formbase/tree/main/packages/convex/src/http/external_api).

## Repository map

```text
formbase-make/
├── app/                         # Base and app settings
├── connections/formbase/        # OAuth connection, common data, scopes
├── functions/                   # Custom IML functions
├── modules/watch_submissions/   # Instant trigger
├── modules/make_api_call/        # Universal JSON-RPC module
├── webhooks/submission_webhook/ # Attached dedicated webhook
├── rpcs/list_forms/             # Paginated form options
├── rpcs/get_sample_submission/  # Dynamic trigger sample
├── rpcs/get_submission_interface/ # Dynamic trigger interface
└── test/                         # Semantic contract tests
```

## Validate locally

```bash
cd /Users/onurhakbilen/git/formbase-make
npm ci
npm test
```

Tests validate JSON syntax plus OAuth, PKCE, refresh rotation, sanitization, API envelopes, pagination, webhook lifecycle, output interface (including the interface the IML function builds from a field list), dynamic sample, and universal-module contracts. They do not execute Make's hosted IML runtime; complete live smoke test after importing definitions.

## 1. Deploy formbase OAuth support

Make needs fixed confidential client credentials. Backend change adds idempotent `seedMakeOAuthClient`, matching existing Zapier seed strategy.

Deploy changed backend first:

```bash
cd /Users/onurhakbilen/git/formbase/packages/convex
pnpm convex deploy
```

Create one long random secret in password manager. Set it interactively so value does not enter shell history:

```bash
pnpm convex env set --prod MAKE_OAUTH_CLIENT_SECRET
```

Seed production client:

```bash
pnpm convex run --prod internal/oauthClients:seedMakeOAuthClient \
  '{"redirectUris":["https://www.make.com/oauth/cb/app"]}'
```

Expected result:

```json
{ "clientId": "fboc_make", "created": true }
```

Re-running updates redirect URIs and secret hash, returning `created: false`. Keep plaintext secret; same value goes into Make encrypted Common data. Never commit it to this repository.

## 2. Create components in Make Developer Hub

Create private app named `formbase`, then create components in this order:

1. OAuth 2.0 connection `formbase`
2. IML function `buildSubmissionInterface`
3. RPC `listForms`
4. RPC `getSampleSubmission`
5. RPC `getSubmissionInterface`
6. attached dedicated web webhook `submission_webhook`
7. instant trigger `watchSubmissions`
8. universal module `makeApiCall`

Paste each file into corresponding Hub editor:

| Repository file | Make Developer Hub field |
| --- | --- |
| `app/base.imljson` | App → Base |
| `app/parameters.imljson` | App → Parameters |
| `connections/formbase/common.imljson` | Connection → Common data |
| `connections/formbase/scope.imljson` | Connection → Default scope |
| `connections/formbase/parameters.imljson` | Connection → Parameters |
| `connections/formbase/communication.imljson` | Connection → Communication |
| `app/readme.md` | App → Readme |
| `functions/buildSubmissionInterface.js` | App → Functions (IML), see note below |
| `rpcs/list_forms/api.imljson` | `listForms` → Communication |
| `rpcs/get_sample_submission/api.imljson` | `getSampleSubmission` → Communication |
| `rpcs/get_submission_interface/api.imljson` | `getSubmissionInterface` → Communication |
| `webhooks/submission_webhook/parameters.imljson` | Webhook → Parameters |
| `webhooks/submission_webhook/attach.imljson` | Webhook → Attach |
| `webhooks/submission_webhook/detach.imljson` | Webhook → Detach |
| `webhooks/submission_webhook/api.imljson` | Webhook → Communication |
| `modules/watch_submissions/parameters.imljson` | Instant trigger → Static parameters |
| `modules/watch_submissions/api.imljson` | Instant trigger → Communication |
| `modules/watch_submissions/interface.imljson` | Instant trigger → Interface (`interface.static.imljson` until IML functions are enabled) |
| `modules/watch_submissions/samples.imljson` | Instant trigger → Samples |
| `modules/make_api_call/parameters.imljson` | Universal module → Static parameters |
| `modules/make_api_call/expect.imljson` | Universal module → Mappable parameters |
| `modules/make_api_call/api.imljson` | Universal module → Communication |
| `modules/make_api_call/interface.imljson` | Universal module → Interface |
| `modules/make_api_call/samples.imljson` | Universal module → Samples |

Custom IML functions are disabled for a new Make app: the Developer Hub has no Functions tab and the `+` menu offers no "Create Function". Make enables them per app through a helpdesk ticket (https://www.make.com/en/ticket). Until then skip steps 2 and 5, and paste `modules/watch_submissions/interface.static.imljson` into Instant trigger → Interface. It is the envelope `buildSubmissionInterface` returns for an unpublished form, with `data.answers` and `data.display` typed `any`, so answers still map by typing `{{1.data.answers.<field key>}}`. Once functions are enabled, add `buildSubmissionInterface`, create the `getSubmissionInterface` RPC, and switch the interface back to `interface.imljson`.

General settings come from each `metadata.imljson`. Set component connection/webhook links exactly as declared there.

Before saving connection Common data, replace `REPLACE_IN_MAKE_DEVELOPER_HUB` with same plaintext secret stored in `MAKE_OAUTH_CLIENT_SECRET`. Do not modify repository copy.

OAuth redirect must remain `oauth.localRedirectUri`. For hosted Make this resolves to registered `https://www.make.com/oauth/cb/app` callback recommended for reviewed apps.

## 3. Live smoke test

Create test scenario in Make:

1. Add **formbase → Watch Submissions**.
2. Create connection. Sign in, select workspace, approve consent. Connection label should show workspace name.
3. Select form and `Submission created`. Use **Make an API Call** with `webhooks.list` to confirm the registered subscription carries no `idleWindow` (the attach body sends it only for abandoned submissions).
4. Open the module's output mapping panel and confirm every question of the selected form is listed under **Answers** and **Answers (display)** by its field key. The list comes from `getSubmissionInterface`; a form that is not published has no field list yet (`fields.list` answers `published: false`), so the module shows the envelope alone until the form is published.
5. Click **Run once**, then submit selected form.
6. Confirm one bundle contains `id`, `type`, `createdAt`, `data.form`, `data.submission` (PDF/language), `data.answers` and `data.display`. New submissions use `submission.completed`; updated submissions use `submission.updated`. `data.answers` values keep their stored type; `data.display` is stable text under the same keys.
7. Deactivate scenario. Use **Make an API Call** with method `webhooks.list` and selected `formId` to confirm subscription was removed.
8. Reactivate with `Submission abandoned`, select an idle window, save a partial response, and leave it unchanged past that window. Confirm delivered bundle uses `submission.abandoned`. The backend sweeps hourly, so delivery can occur up to about one hour after the selected threshold.
9. Run error scenario with unknown API method; confirm readable `METHOD_NOT_FOUND` error.
10. If review is planned, test form picker against workspace with more than 100 forms and retain execution logs showing pagination.

## 4. Publish

- For team-only use, save scenario in organization and confirm app installation.
- For invite-link distribution, click **Publish**. Publishing cannot be undone and published components cannot be deleted.
- For Make marketplace, expose both modules, run fresh test scenarios, then complete **Review** tab with API docs, support contact, and scenario links.

Make review requires sanitization, error handling, interfaces, pagination, limits, universal API module, and recent successful/error scenario logs. This mirror includes code requirements; live logs must be generated in Make.

## References

- [Make OAuth 2.0 and PKCE](https://developers.make.com/custom-apps-documentation/app-components/connections/oauth2)
- [Make attached webhooks](https://developers.make.com/custom-apps-documentation/app-components/webhooks/dedicated/attached)
- [Make instant triggers](https://developers.make.com/custom-apps-documentation/app-components/modules/instant-trigger)
- [Make app review prerequisites](https://developers.make.com/custom-apps-documentation/app-review/prerequisites)
- [formbase REST API](https://docs.formbase.so/developers/rest-api)
- [formbase webhooks](https://docs.formbase.so/developers/webhooks-reference)
