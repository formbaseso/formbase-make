# formbase Make Custom App (IML mirror)

This folder is a **git-tracked mirror** of the formbase custom app definition that lives in the [Make Developer Hub](https://www.make.com/en/help/apps/about-developing-apps). It is **not** a runnable bundle — Make Developer Hub is the source of truth at runtime. We keep these files in git so we get code review, version history, and a clear onboarding path for new contributors.

## What lives here

Each `.imljson` file mirrors one field in the Make Developer Hub UI. The folders correspond directly to the sidebar sections in the Hub:

```
formbase-make/
├── app/                        # App-level config (Base, Metadata, Parameters)
├── connections/formbase/       # API-key connection
├── modules/watch_submissions/  # Instant trigger module
├── webhooks/submission_webhook/# Web webhook backing the trigger
└── rpcs/list_forms/            # Dynamic select RPC for the formId picker
```

## Sync workflow

Make Developer Hub does not have a public CLI/git integration for community apps, so syncing is **manual** in both directions.

### Hub → git (export)

1. Edit the app in Make Developer Hub.
2. For each field you changed, click the field and copy the JSON.
3. Paste into the matching `.imljson` file here.
4. Commit with a `*(make): ...` conventional message describing the change.
5. Open a PR for review.

### git → Hub (import)

1. Review and merge the PR in this repo.
2. In Make Developer Hub, open the corresponding field.
3. Paste the contents of each updated `.imljson` file into the matching field.
4. Save and re-publish the app version.

## File-to-Hub field mapping

| File                                             | Hub location                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| `app/base.imljson`                               | App → Base                                                                      |
| `app/metadata.imljson`                           | App → General (name, label, description, version, language, countries, private) |
| `app/parameters.imljson`                         | App → Parameters                                                                |
| `connections/formbase/metadata.imljson`          | Connections → formbase → General                                                |
| `connections/formbase/parameters.imljson`        | Connections → formbase → Parameters                                             |
| `connections/formbase/communication.imljson`     | Connections → formbase → Communication                                          |
| `modules/watch_submissions/metadata.imljson`     | Modules → watch_submissions → General                                           |
| `modules/watch_submissions/api.imljson`          | Modules → watch_submissions → Communication                                     |
| `modules/watch_submissions/parameters.imljson`   | Modules → watch_submissions → Mappable parameters                               |
| `modules/watch_submissions/interface.imljson`    | Modules → watch_submissions → Interface                                         |
| `modules/watch_submissions/samples.imljson`      | Modules → watch_submissions → Samples                                           |
| `webhooks/submission_webhook/metadata.imljson`   | Webhooks → submission_webhook → General                                         |
| `webhooks/submission_webhook/api.imljson`        | Webhooks → submission_webhook → Communication                                   |
| `webhooks/submission_webhook/parameters.imljson` | Webhooks → submission_webhook → Parameters                                      |
| `webhooks/submission_webhook/attach.imljson`     | Webhooks → submission_webhook → Attach                                          |
| `webhooks/submission_webhook/detach.imljson`     | Webhooks → submission_webhook → Detach                                          |
| `rpcs/list_forms/metadata.imljson`               | RPCs → listForms → General                                                      |
| `rpcs/list_forms/api.imljson`                    | RPCs → listForms → Communication                                                |

## Validation

Before committing, ensure every `.imljson` file is valid JSON:

```sh
cd formbase-make
node -e "require('fs').readdirSync('.', { recursive: true }).filter(f => f.endsWith('.imljson')).forEach(f => JSON.parse(require('fs').readFileSync(f)))"
```

## Reference

- Make custom-app docs: https://docs.make.com/custom-apps-documentation/
- Formbase JSON-RPC API base URL: `https://api.formbase.so/api/v1`
- [Formbase API methods](https://docs.formbase.so/developers/rest-api)
