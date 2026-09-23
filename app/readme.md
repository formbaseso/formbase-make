# formbase

formbase collects and verifies customer information for workflows and AI agents. A caller creates a request, the customer completes a branded form, and formbase hands the answers back to your scenario.

## Connection

Sign in with your formbase account (OAuth 2.0). One connection covers one workspace.

## Modules

- **Watch Submissions** (instant trigger): fires when a customer completes a request or submits a form, or abandons a partial submission. Answers arrive under `data.answers` keyed by field key, readable text under `data.display`, and `data.request` carries the request ID and external ID when the submission answered a request.
- **Make an API Call**: calls any formbase API method with a JSON parameters object. See https://docs.formbase.so/developers/rest-api.

## Links

- Documentation: https://docs.formbase.so
