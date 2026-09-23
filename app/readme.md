# formbase

formbase collects and verifies customer information for workflows and AI agents. A caller creates a request, the customer completes a branded form, and formbase hands the answers back to your scenario.

## Connection

Sign in with your formbase account (OAuth 2.0). One connection covers one workspace.

## Modules

- **Create a Request**: assigns a published form to one recipient and returns the request link. Prefill answers and hidden-field context are keyed by field key; set an external ID and a re-run scenario reuses the request instead of creating a second one.
- **Watch Requests** (instant trigger): fires when a request is completed, expires, or is canceled. `data.request` carries the request ID, external ID, status, outcome, recipient and metadata; a completed request also delivers `data.answers` keyed by field key and `data.display` with readable text. Test requests never reach it.
- **Get a Request**: one request with its status, outcome, request link, timeline, and the answers once the recipient has completed it.
- **Cancel a Request**: withdraws a pending request with an optional reason.
- **Remind a Request**: emails the recipient a reminder now.
- **Search Requests**: lists a form's requests by status or external ID.
- **Watch Public Link Submissions** (instant trigger): fires when a respondent submits the form through its public link, updates that submission later, or abandons it. Answers arrive under `data.answers` keyed by field key and readable text under `data.display`. A completed request fires Watch Requests instead (one channel, one event).
- **Make an API Call**: calls any formbase API method with a JSON parameters object. See https://docs.formbase.so/developers/rest-api.

Deliveries to Make are not signed: a Make custom-app webhook never sees the raw request body, so the `X-formbase-Signature` header cannot be verified. The unguessable `hook.make.com` URL over HTTPS protects them.

## Links

- Documentation: https://docs.formbase.so
