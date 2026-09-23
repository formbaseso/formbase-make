/**
 * Builds the Watch Requests output interface from `fields.list` and the
 * subscribed event type.
 *
 * Every request event is the formbase envelope `{ id, type, createdAt,
 * apiVersion, test, data }` with `data.request` for every type. A
 * `request.completed` event also carries `data.form`, `data.submission`,
 * `data.answers` and `data.display`, identical to a `submission.completed`
 * event, so those four come from `buildSubmissionInterface` and a field key
 * maps under the same pill in both triggers. An expired or canceled request
 * has no submission, so its interface stops at the request block.
 *
 * Called from `rpcs/get_request_event_interface/api.imljson` as
 * `{{buildRequestEventInterface(body.data.items, webhook.eventType)}}`.
 */
function buildRequestEventInterface(items, eventType) {
    var submission = iml.buildSubmissionInterface(items)
    var submissionData = submission[submission.length - 1].spec
    function part(name) {
        for (var i = 0; i < submissionData.length; i++) {
            if (submissionData[i].name === name) return submissionData[i]
        }
        return undefined
    }

    var dataSpec = [
        {
            name: 'request',
            type: 'collection',
            label: 'Request',
            spec: [
                { name: 'id', type: 'text', label: 'Request ID' },
                { name: 'externalId', type: 'text', label: 'External ID' },
                { name: 'status', type: 'text', label: 'Status', help: 'completed, expired or canceled.' },
                { name: 'outcome', type: 'text', label: 'Outcome', help: 'The recipient\'s verdict from the decision question: approve, decline or changes. Present only on a completed request with one.' },
                { name: 'language', type: 'text', label: 'Language' },
                {
                    name: 'recipient',
                    type: 'collection',
                    label: 'Recipient',
                    spec: [
                        { name: 'email', type: 'email', label: 'Recipient Email' },
                        { name: 'name', type: 'text', label: 'Recipient Name' }
                    ]
                },
                { name: 'metadata', type: 'any', label: 'Metadata' },
                { name: 'context', type: 'any', label: 'Context' },
                { name: 'createdAt', type: 'date', label: 'Created At' },
                { name: 'completedAt', type: 'date', label: 'Completed At' },
                { name: 'expiredAt', type: 'date', label: 'Expired At' },
                { name: 'canceledAt', type: 'date', label: 'Canceled At' },
                { name: 'cancelReason', type: 'text', label: 'Cancel Reason' }
            ]
        }
    ]
    if (eventType === 'request_completed') {
        dataSpec.push(part('form'), part('submission'), part('answers'), part('display'))
    }

    return [
        { name: 'id', type: 'text', label: 'Event ID' },
        { name: 'type', type: 'text', label: 'Event Type' },
        { name: 'createdAt', type: 'date', label: 'Event Timestamp' },
        { name: 'apiVersion', type: 'text', label: 'API Version' },
        { name: 'test', type: 'boolean', label: 'Test Event' },
        { name: 'data', type: 'collection', label: 'Data', spec: dataSpec }
    ]
}
