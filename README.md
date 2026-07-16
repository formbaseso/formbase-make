# formbase Make integration

Git-tracked mirror of formbase custom app configuration for [Make Developer Hub](https://developers.make.com/custom-apps-documentation/). Make hosts and executes these definitions; this repository supplies reviewable IML JSON, contract tests, and deployment instructions.

## Integration surface

- OAuth 2.0 authorization-code connection with mandatory PKCE S256
- Rotating access and refresh tokens (`api:read api:write offline_access`)
- Workspace-scoped, cursor-paginated form picker
- Attached dedicated webhook with automatic subscribe/unsubscribe
- `submission_created` and `submission_abandoned` events, with required 12-hour, 1-day, 3-day, or 1-week idle windows for abandoned submissions
- Dynamic sample payload from `submissions.sample`
- Universal **Make an API Call** module for other formbase JSON-RPC methods
- Current webhook fields: event, form, submission email/date/PDF/language, and answer fields
- Webhook payload `eventType` values: `SUBMIT_RESPONSE`, `UPDATE_RESPONSE`, and `ABANDON_RESPONSE`

Implementation follows current formbase [n8n](https://github.com/formbaseso/n8n-nodes-formbase) and [Zapier](https://github.com/formbaseso/formbase-zapier) integrations. Canonical API contract lives in [formbaseso/formbase](https://github.com/formbaseso/formbase/tree/main/packages/convex/src/http/external_api).

## Repository map

```text
formbase-make/
├── app/                         # Base and app settings
├── connections/formbase/        # OAuth connection, common data, scopes
├── modules/watch_submissions/   # Instant trigger
├── modules/make_api_call/        # Universal JSON-RPC module
├── webhooks/submission_webhook/ # Attached dedicated webhook
├── rpcs/list_forms/             # Paginated form options
├── rpcs/get_sample_submission/  # Dynamic trigger sample
└── test/                         # Semantic contract tests
```

## Validate locally

```bash
cd /Users/onurhakbilen/git/formbase-make
npm ci
npm test
```

Tests validate JSON syntax plus OAuth, PKCE, refresh rotation, sanitization, API envelopes, pagination, webhook lifecycle, output interface, dynamic sample, and universal-module contracts. They do not execute Make's hosted IML runtime; complete live smoke test after importing definitions.

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
2. RPC `listForms`
3. RPC `getSampleSubmission`
4. attached dedicated web webhook `submission_webhook`
5. instant trigger `watchSubmissions`
6. universal module `makeApiCall`

Paste each file into corresponding Hub editor:

| Repository file | Make Developer Hub field |
| --- | --- |
| `app/base.imljson` | App → Base |
| `app/parameters.imljson` | App → Parameters |
| `connections/formbase/common.imljson` | Connection → Common data |
| `connections/formbase/scope.imljson` | Connection → Default scope |
| `connections/formbase/parameters.imljson` | Connection → Parameters |
| `connections/formbase/communication.imljson` | Connection → Communication |
| `rpcs/list_forms/api.imljson` | `listForms` → Communication |
| `rpcs/get_sample_submission/api.imljson` | `getSampleSubmission` → Communication |
| `webhooks/submission_webhook/parameters.imljson` | Webhook → Parameters |
| `webhooks/submission_webhook/attach.imljson` | Webhook → Attach |
| `webhooks/submission_webhook/detach.imljson` | Webhook → Detach |
| `webhooks/submission_webhook/api.imljson` | Webhook → Communication |
| `modules/watch_submissions/parameters.imljson` | Instant trigger → Static parameters |
| `modules/watch_submissions/api.imljson` | Instant trigger → Communication |
| `modules/watch_submissions/interface.imljson` | Instant trigger → Interface |
| `modules/watch_submissions/samples.imljson` | Instant trigger → Samples |
| `modules/make_api_call/parameters.imljson` | Universal module → Static parameters |
| `modules/make_api_call/expect.imljson` | Universal module → Mappable parameters |
| `modules/make_api_call/api.imljson` | Universal module → Communication |
| `modules/make_api_call/interface.imljson` | Universal module → Interface |
| `modules/make_api_call/samples.imljson` | Universal module → Samples |

General settings come from each `metadata.imljson`. Set component connection/webhook links exactly as declared there.

Before saving connection Common data, replace `REPLACE_IN_MAKE_DEVELOPER_HUB` with same plaintext secret stored in `MAKE_OAUTH_CLIENT_SECRET`. Do not modify repository copy.

OAuth redirect must remain `oauth.localRedirectUri`. For hosted Make this resolves to registered `https://www.make.com/oauth/cb/app` callback recommended for reviewed apps.

## 3. Live smoke test

Create test scenario in Make:

1. Add **formbase → Watch Submissions**.
2. Create connection. Sign in, select workspace, approve consent. Connection label should show workspace name.
3. Select form and `Submission created`.
4. Click **Run once**, then submit selected form.
5. Confirm one bundle contains `eventId`, `eventType`, `eventTimestamp`, form data, submission PDF/language, and fields. New submissions use `SUBMIT_RESPONSE`; updated submissions use `UPDATE_RESPONSE`. `fields[].value.raw` remains dynamically typed; `display` is stable text.
6. Deactivate scenario. Use **Make an API Call** with method `webhooks.list` and selected `formId` to confirm subscription was removed.
7. Reactivate with `Submission abandoned`, select an idle window, save a partial response, and leave it unchanged past that window. Confirm delivered bundle uses `ABANDON_RESPONSE`. The backend sweeps hourly, so delivery can occur up to about one hour after the selected threshold.
8. Run error scenario with unknown API method; confirm readable `METHOD_NOT_FOUND` error.
9. If review is planned, test form picker against workspace with more than 100 forms and retain execution logs showing pagination.

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
