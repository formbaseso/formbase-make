import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VALID_INTERFACE_TYPES = new Set([
    'any',
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

/**
 * Loads an IML function the way Make does: the file is a bare function
 * declaration pasted into the Hub's Functions editor, not a module.
 */
function loadImlFunction(relativePath, name) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
    return new Function(`${source}\nreturn ${name}`)()
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
    assert.equal(base.baseUrl, 'https://api.formbase.so')
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
    assert.match(communication.authorize.qs.code_challenge, /replace\(replace\(replace/)
    assert.equal(communication.authorize.qs.code_challenge.includes('base64url('), false)

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
    const webhookParameters = readJson('webhooks/submission_webhook/parameters.imljson')
    const webhook = readJson('webhooks/submission_webhook/api.imljson')
    const attach = readJson('webhooks/submission_webhook/attach.imljson')
    const detach = readJson('webhooks/submission_webhook/detach.imljson')

    assert.deepEqual(moduleApi, {})
    assert.deepEqual(moduleParameters, [])
    assert.equal(webhookParameters.find((field) => field.name === 'formId')?.options.store, 'rpc://listForms')
    const eventType = webhookParameters.find((field) => field.name === 'eventType')
    assert.equal(eventType?.default, 'submission_created')
    const abandonedOption = eventType.options.find((option) => option.value === 'submission_abandoned')
    const idleWindow = abandonedOption.nested.find((field) => field.name === 'idleWindow')
    assert.equal(idleWindow.required, true)
    assert.equal(idleWindow.default, '12h')
    assert.deepEqual(
        idleWindow.options.map((option) => option.value),
        ['12h', '1d', '3d', '1w']
    )

    assert.equal('verification' in webhook, false)
    assert.equal(webhook.output, '{{body}}')
    assert.equal(webhook.respond.status, 200)

    assert.equal(attach.body.method, 'webhooks.create')
    assert.equal(attach.url, '/api/v1')
    assert.equal(attach.body.params.formId, '{{parameters.formId}}')
    assert.equal(attach.body.params.provider, 'make')
    assert.equal(attach.body.params.eventType, '{{parameters.eventType}}')
    // A created subscription must not send idleWindow at all, not even one left over from a
    // previous abandoned selection; `undefined` makes Make omit the key.
    assert.equal(attach.body.params.idleWindow, "{{if(parameters.eventType = 'submission_abandoned', parameters.idleWindow, undefined)}}")
    assert.equal(attach.response.data.subscriptionId, '{{body.data.subscriptionId}}')

    assert.equal(detach.body.method, 'webhooks.delete')
    assert.equal(detach.url, '/api/v1')
    assert.deepEqual(detach.body.params, { subscriptionId: '{{webhook.subscriptionId}}' })
})

test('form picker and sample RPC match current paginated API envelopes', () => {
    const listForms = readJson('rpcs/list_forms/api.imljson')
    const sample = readJson('rpcs/get_sample_submission/api.imljson')
    const moduleSamples = readJson('modules/watch_submissions/samples.imljson')

    assert.equal(listForms.body.method, 'forms.list')
    assert.equal(listForms.url, '/api/v1')
    assert.equal(listForms.body.params.workspaceId, '{{connection.workspaceId}}')
    assert.equal(listForms.response.iterate, '{{body.data.items}}')
    assert.equal(listForms.response.output.value, '{{item.id}}')
    assert.equal(listForms.response.limit, 300)
    assert.match(listForms.pagination.condition, /hasMore/)
    assert.equal(listForms.pagination.body.params.cursor, '{{body.data.nextCursor}}')

    assert.equal(moduleSamples, 'rpc://getSampleSubmission')
    assert.equal(sample.body.method, 'submissions.sample')
    assert.equal(sample.url, '/api/v1')
    assert.equal(sample.body.params.formId, '{{webhook.formId}}')
    assert.equal(sample.response.output, '{{body.data}}')
})

test('static interface fallback is the envelope with untyped answers', () => {
    const staticInterface = readJson('modules/watch_submissions/interface.static.imljson')
    const buildSubmissionInterface = loadImlFunction('functions/buildSubmissionInterface.js', 'buildSubmissionInterface')

    const expected = buildSubmissionInterface([])
    const data = expected.find((field) => field.name === 'data')
    for (const name of ['answers', 'display']) {
        const index = data.spec.findIndex((field) => field.name === name)
        const field = data.spec[index]
        data.spec[index] = { name: field.name, type: 'any', label: field.label, help: field.help }
    }
    assert.deepEqual(staticInterface, expected)
})

test('abandoned submission fixture and interface match the event envelope', () => {
    const fixture = readJson('test/fixtures/submission.json')
    const metadata = readJson('modules/watch_submissions/metadata.imljson')
    const outputInterface = readJson('modules/watch_submissions/interface.imljson')
    const buildSubmissionInterface = loadImlFunction('functions/buildSubmissionInterface.js', 'buildSubmissionInterface')

    assert.equal(outputInterface, 'rpc://getSubmissionInterface')
    const envelopeOnly = buildSubmissionInterface([])
    assertInterfaceFields(envelopeOnly)
    assert.equal(fixture.type, 'submission.abandoned')
    assert.equal(typeof fixture.apiVersion, 'string')
    assert.equal(typeof fixture.test, 'boolean')
    assert.match(metadata.description, /submission\.abandoned/)
    assert.equal(typeof fixture.data.submission.pdfUrl, 'string')
    assert.equal(fixture.data.submission.language, 'en')
    assert.equal('fields' in fixture, false)
    assert.deepEqual(Object.keys(fixture.data.display), Object.keys(fixture.data.answers))
    assert.ok(Object.values(fixture.data.answers).some((value) => Array.isArray(value)))

    assert.deepEqual(
        envelopeOnly.map((field) => field.name),
        ['id', 'type', 'createdAt', 'apiVersion', 'test', 'data']
    )
    const dataInterface = envelopeOnly.find((field) => field.name === 'data')
    const submissionInterface = dataInterface.spec.find((field) => field.name === 'submission')
    assert.deepEqual(
        submissionInterface.spec.map((field) => field.name),
        ['id', 'respondentEmail', 'submittedAt', 'pdfUrl', 'language']
    )
    for (const name of ['answers', 'display']) {
        assert.equal(dataInterface.spec.find((field) => field.name === name)?.type, 'collection')
        assert.deepEqual(dataInterface.spec.find((field) => field.name === name).spec, [])
    }
})

test('dynamic interface RPC builds answer fields from the published field list', () => {
    const rpcApi = readJson('rpcs/get_submission_interface/api.imljson')
    const rpcMetadata = readJson('rpcs/get_submission_interface/metadata.imljson')
    const buildSubmissionInterface = loadImlFunction('functions/buildSubmissionInterface.js', 'buildSubmissionInterface')

    assert.equal(rpcMetadata.name, 'getSubmissionInterface')
    assert.equal(rpcMetadata.connection, 'formbase')
    assert.equal(rpcApi.url, '/api/v1')
    assert.equal(rpcApi.body.method, 'fields.list')
    assert.equal(rpcApi.body.params.formId, '{{webhook.formId}}')
    assert.equal(rpcApi.response.output, '{{buildSubmissionInterface(body.data.items)}}')

    // The shape fields.list returns: plain fields, then one repeating group.
    const built = buildSubmissionInterface([
        { key: 'your_name', type: 'text', title: 'Your name', required: true, prefillable: true },
        { key: 'rating', type: 'rating', title: 'How likely are you to recommend us?', required: false, prefillable: true },
        { key: 'signed_on', type: 'date', title: 'Signed on', required: false, prefillable: true },
        { key: 'plan', type: 'select', title: 'Plan', required: false, prefillable: true, options: [{ key: 'pro', label: 'Pro' }] },
        { key: 'topics', type: 'checkbox', title: 'Topics', required: false, prefillable: true, options: [{ key: 'billing', label: 'Billing' }] },
        {
            key: 'satisfaction',
            type: 'matrix',
            title: 'How did we do?',
            required: false,
            prefillable: true,
            rows: [{ key: 'delivery_speed', label: 'Delivery speed' }, { key: 'support', label: 'Support' }],
            columns: [{ key: 'very_good', label: 'Very good' }, { key: 'poor', label: 'Poor' }]
        },
        { key: 'account_id', type: 'hidden', title: 'Account ID', required: false, prefillable: false, context: true },
        { key: 'total', type: 'number', title: 'Total', required: false, prefillable: false, calculated: true },
        {
            key: 'attendees',
            type: 'group',
            repeating: true,
            members: [{ key: 'attendee_name', type: 'text', title: 'Attendee name', required: true, prefillable: true }]
        }
    ])

    assertInterfaceFields(built)
    const data = built.find((field) => field.name === 'data')
    const answers = data.spec.find((field) => field.name === 'answers')
    const display = data.spec.find((field) => field.name === 'display')
    const answer = (name) => answers.spec.find((field) => field.name === name)

    const answerKeys = answers.spec.map((field) => field.name)
    assert.deepEqual(answerKeys, ['your_name', 'rating', 'signed_on', 'plan', 'topics', 'satisfaction', 'account_id', 'total', 'attendees'])
    assert.deepEqual(display.spec.map((field) => field.name), answerKeys)
    assert.equal(display.spec.find((field) => field.name === 'plan').label, 'Plan (display)')

    assert.deepEqual(answer('your_name'), { name: 'your_name', type: 'text', label: 'Your name' })
    assert.equal(answer('rating').type, 'number')
    assert.equal(answer('signed_on').type, 'date')
    // A choice answer is the option key; a multi-choice answer is a list of them.
    assert.equal(answer('plan').type, 'text')
    assert.deepEqual(answer('topics'), { name: 'topics', type: 'array', label: 'Topics', spec: { type: 'text' } })
    // A matrix answer is `{ row_key: column_key }`, so each row is mappable on its own.
    assert.deepEqual(answer('satisfaction'), {
        name: 'satisfaction',
        type: 'collection',
        label: 'How did we do?',
        spec: [
            { name: 'delivery_speed', type: 'text', label: 'Delivery speed' },
            { name: 'support', type: 'text', label: 'Support' }
        ]
    })
    assert.equal(answer('account_id').type, 'text')
    assert.equal(answer('total').type, 'number')

    const group = answers.spec.find((field) => field.name === 'attendees')
    assert.equal(group.type, 'array')
    assert.equal(group.spec.type, 'collection')
    assert.deepEqual(group.spec.spec.map((field) => field.name), ['attendee_name'])
    assert.equal(display.spec.find((field) => field.name === 'attendees').type, 'text')

    // Every key the fixture carries is mappable, under both collections.
    const fixture = readJson('test/fixtures/submission.json')
    const fixtureInterface = buildSubmissionInterface([
        { key: 'your_name', type: 'text', title: 'Your name' },
        { key: 'rating', type: 'rating', title: 'Rating' },
        { key: 'attendees', type: 'group', repeating: true, members: [{ key: 'attendee_name', type: 'text', title: 'Attendee name' }] }
    ])
    const fixtureAnswers = fixtureInterface
        .find((field) => field.name === 'data')
        .spec.find((field) => field.name === 'answers')
    assert.deepEqual(fixtureAnswers.spec.map((field) => field.name), Object.keys(fixture.data.answers))
})

test('universal API module forwards method and JSON params through current envelope', () => {
    const metadata = readJson('modules/make_api_call/metadata.imljson')
    const api = readJson('modules/make_api_call/api.imljson')
    const expect = readJson('modules/make_api_call/expect.imljson')
    const outputInterface = readJson('modules/make_api_call/interface.imljson')

    assert.equal(metadata.label, 'Make an API Call')
    assert.equal(metadata.type, 'universal')
    assert.equal(metadata.name, 'makeApiCall')
    assert.equal(api.url, '/api/v1')
    assert.equal(api.body.method, '{{parameters.method}}')
    assert.equal(api.body.params, '{{parameters.params}}')
    assert.deepEqual(api.response.output, { data: '{{body.data}}' })
    assert.equal(expect.find((field) => field.name === 'params')?.type, 'json')
    assert.equal(outputInterface.find((field) => field.name === 'data')?.type, 'any')
})
