import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VALID_INTERFACE_TYPES = new Set([
    'array',
    'boolean',
    'buffer',
    'collection',
    'date',
    'email',
    'filename',
    'integer',
    'json',
    'number',
    'text',
    'timestamp',
    'uinteger',
    'url',
    'uuid'
])

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'))
}

function walkFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const absolutePath = path.join(directory, entry.name)
        return entry.isDirectory() ? walkFiles(absolutePath) : [absolutePath]
    })
}

function assertInterfaceFields(fields, location = 'interface') {
    for (const field of fields) {
        assert.equal(typeof field.name, 'string', `${location} field must have a name`)
        assert.ok(VALID_INTERFACE_TYPES.has(field.type), `${location}.${field.name} has unsupported type ${field.type}`)

        if (field.type === 'collection') {
            assert.ok(Array.isArray(field.spec), `${location}.${field.name}.spec must be an array`)
            assertInterfaceFields(field.spec, `${location}.${field.name}`)
        }

        if (field.type === 'array' && Array.isArray(field.spec)) {
            assertInterfaceFields(field.spec, `${location}.${field.name}[]`)
        }

        if (field.type === 'array' && field.spec?.type === 'collection') {
            assert.ok(Array.isArray(field.spec.spec), `${location}.${field.name}[].spec must be an array`)
            assertInterfaceFields(field.spec.spec, `${location}.${field.name}[]`)
        }
    }
}

test('all IML mirror files contain valid JSON', () => {
    const files = walkFiles(ROOT).filter((file) => file.endsWith('.imljson'))
    assert.ok(files.length >= 25)

    for (const file of files) {
        assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, 'utf8')), path.relative(ROOT, file))
    }
})

test('base uses OAuth bearer auth, envelope errors, and sanitized logs', () => {
    const base = readJson('app/base.imljson')
    assert.equal(base.baseUrl, 'https://api.formbase.so/api/v1')
    assert.equal(base.headers.Authorization, 'Bearer {{connection.accessToken}}')
    assert.equal(base.response.error['401'].type, 'InvalidAccessTokenError')
    assert.equal(base.response.error['429'].type, 'RateLimitError')
    assert.ok(base.log.sanitize.includes('request.headers.authorization'))
    assert.equal(JSON.stringify(base).includes('connection.apiKey'), false)
})

test('OAuth connection implements PKCE, confidential client auth, rotation, and workspace scoping', () => {
    const common = readJson('connections/formbase/common.imljson')
    const communication = readJson('connections/formbase/communication.imljson')
    const scope = readJson('connections/formbase/scope.imljson')

    assert.equal(common.clientId, 'fboc_make')
    assert.equal(common.clientSecret, 'REPLACE_IN_MAKE_DEVELOPER_HUB')
    assert.deepEqual(scope, ['api:read', 'api:write', 'offline_access'])

    assert.equal(communication.authorize.url, 'https://api.formbase.so/oauth/authorize')
    assert.equal(communication.authorize.qs.redirect_uri, '{{oauth.localRedirectUri}}')
    assert.equal(communication.authorize.qs.code_challenge_method, 'S256')
    assert.match(communication.authorize.qs.code_challenge, /sha256\(temp\.codeVerifier/)

    assert.equal(communication.token.url, 'https://api.formbase.so/oauth/token')
    assert.equal(communication.token.type, 'urlencoded')
    assert.equal(communication.token.body.grant_type, 'authorization_code')
    assert.equal(communication.token.body.code_verifier, '{{temp.codeVerifier}}')
    assert.equal(communication.token.body.client_secret, '{{common.clientSecret}}')
    assert.equal(communication.token.response.data.refreshToken, '{{body.refresh_token}}')

    assert.equal(communication.refresh.body.grant_type, 'refresh_token')
    assert.equal(communication.refresh.body.refresh_token, '{{data.refreshToken}}')
    assert.equal(communication.refresh.response.data.refreshToken, '{{body.refresh_token}}')
    assert.match(communication.refresh.condition, /data\.expires/)

    assert.equal(communication.info.body.method, 'workspaces.list')
    assert.equal(communication.info.response.data.workspaceId, '{{body.data.items[1].id}}')
    assert.ok(communication.info.log.sanitize.includes('request.headers.authorization'))

    const serialized = JSON.stringify(communication)
    for (const secretPath of ['request.body.code_verifier', 'request.body.client_secret', 'response.body.access_token', 'response.body.refresh_token']) {
        assert.ok(serialized.includes(secretPath), `${secretPath} must be sanitized`)
    }
})

test('instant trigger delegates lifecycle to attached webhook', () => {
    const moduleApi = readJson('modules/watch_submissions/api.imljson')
    const moduleParameters = readJson('modules/watch_submissions/parameters.imljson')
    const webhook = readJson('webhooks/submission_webhook/api.imljson')
    const attach = readJson('webhooks/submission_webhook/attach.imljson')
    const detach = readJson('webhooks/submission_webhook/detach.imljson')

    assert.deepEqual(moduleApi, {})
    assert.equal(moduleParameters.find((field) => field.name === 'formId')?.options.store, 'rpc://listForms')
    assert.equal(moduleParameters.find((field) => field.name === 'eventType')?.default, 'submission_created')

    assert.equal('verification' in webhook, false)
    assert.equal(webhook.output, '{{body}}')
    assert.equal(webhook.respond.status, 200)

    assert.equal(attach.body.method, 'webhooks.create')
    assert.equal(attach.body.params.provider, 'make')
    assert.equal(attach.body.params.eventType, '{{parameters.eventType}}')
    assert.equal(attach.response.data.subscriptionId, '{{body.data.subscriptionId}}')

    assert.equal(detach.body.method, 'webhooks.delete')
    assert.deepEqual(detach.body.params, { subscriptionId: '{{webhook.subscriptionId}}' })
})

test('form picker and sample RPC match current paginated API envelopes', () => {
    const listForms = readJson('rpcs/list_forms/api.imljson')
    const sample = readJson('rpcs/get_sample_submission/api.imljson')
    const moduleSamples = readJson('modules/watch_submissions/samples.imljson')

    assert.equal(listForms.body.method, 'forms.list')
    assert.equal(listForms.body.params.workspaceId, '{{connection.workspaceId}}')
    assert.equal(listForms.response.iterate, '{{body.data.items}}')
    assert.equal(listForms.response.output.value, '{{item.id}}')
    assert.equal(listForms.response.limit, 300)
    assert.match(listForms.pagination.condition, /hasMore/)
    assert.equal(listForms.pagination.body.params.cursor, '{{body.data.nextCursor}}')

    assert.equal(moduleSamples, 'rpc://getSampleSubmission')
    assert.equal(sample.body.method, 'submissions.sample')
    assert.equal(sample.body.params.formId, '{{parameters.formId}}')
    assert.equal(sample.response.output, '{{body.data}}')
})

test('submission fixture and interface match current webhook contract', () => {
    const fixture = readJson('test/fixtures/submission.json')
    const outputInterface = readJson('modules/watch_submissions/interface.imljson')

    assertInterfaceFields(outputInterface)
    assert.equal(fixture.eventType, 'SUBMIT_RESPONSE')
    assert.equal(typeof fixture.submission.submissionPdfLink, 'string')
    assert.equal(fixture.submission.language, 'en')
    assert.ok(fixture.fields.every((field) => field.fieldId && field.key && field.value.display))
    assert.ok(fixture.fields.some((field) => Array.isArray(field.value.raw)))

    const submissionInterface = outputInterface.find((field) => field.name === 'submission')
    assert.deepEqual(
        submissionInterface.spec.map((field) => field.name),
        ['id', 'respondentEmail', 'submittedAt', 'submissionPdfLink', 'language']
    )
})

test('universal API module forwards method and JSON params through current envelope', () => {
    const metadata = readJson('modules/make_api_call/metadata.imljson')
    const api = readJson('modules/make_api_call/api.imljson')
    const expect = readJson('modules/make_api_call/expect.imljson')

    assert.equal(metadata.label, 'Make an API Call')
    assert.equal(metadata.type, 'universal')
    assert.equal(api.body.method, '{{parameters.method}}')
    assert.equal(api.body.params, '{{parameters.params}}')
    assert.equal(api.response.output, '{{body.data}}')
    assert.equal(expect.find((field) => field.name === 'params')?.type, 'json')
})
