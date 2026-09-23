/**
 * Builds the Get a Request output interface from `fields.list`.
 *
 * `requests.get` returns the request summary plus, once the request is
 * completed, the same `answers` and `display` maps a `request.completed` event
 * carries. The summary half is fixed; the per-form half comes from
 * `buildSubmissionInterface`, so a field key is mappable under the same pill
 * whether the answers arrive through Watch Public Link Submissions, Watch Requests or a
 * Get a Request call.
 *
 * Called from `rpcs/get_request_interface/api.imljson` as
 * `{{buildRequestInterface(body.data.items)}}`. With no items (a form that is
 * not published yet) it returns the summary alone, so the module stays
 * mappable.
 */
function buildRequestInterface(items) {
    var submission = iml.buildSubmissionInterface(items)
    var submissionData = submission[submission.length - 1].spec
    function part(name) {
        for (var i = 0; i < submissionData.length; i++) {
            if (submissionData[i].name === name) return submissionData[i]
        }
        return undefined
    }

    return [
        { name: 'id', type: 'text', label: 'Request ID' },
        { name: 'status', type: 'text', label: 'Status', help: 'pending, completed, expired or canceled.' },
        { name: 'outcome', type: 'text', label: 'Outcome', help: 'The recipient\'s verdict from the decision question: approve, decline or changes. Empty when there is none.' },
        { name: 'url', type: 'url', label: 'Request Link' },
        { name: 'workspaceId', type: 'text', label: 'Workspace ID' },
        { name: 'formId', type: 'text', label: 'Form ID' },
        { name: 'formSnapshotId', type: 'text', label: 'Published Version ID' },
        { name: 'submissionId', type: 'text', label: 'Submission ID' },
        { name: 'createdVia', type: 'text', label: 'Created Via' },
        { name: 'isTest', type: 'boolean', label: 'Test Request' },
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
        { name: 'externalId', type: 'text', label: 'External ID' },
        { name: 'metadata', type: 'any', label: 'Metadata' },
        { name: 'context', type: 'any', label: 'Context' },
        { name: 'prefill', type: 'any', label: 'Prefill' },
        { name: 'readonlyKeys', type: 'array', label: 'Read-only Field Keys', spec: { type: 'text' } },
        {
            name: 'documents',
            type: 'array',
            label: 'Documents',
            spec: {
                type: 'collection',
                spec: [
                    { name: 'field', type: 'text', label: 'Field Key' },
                    { name: 'name', type: 'text', label: 'Name' },
                    { name: 'size', type: 'number', label: 'Size (bytes)' },
                    { name: 'contentType', type: 'text', label: 'Content Type' }
                ]
            }
        },
        { name: 'delivery', type: 'text', label: 'Delivery' },
        { name: 'deliveryStatus', type: 'text', label: 'Delivery Status' },
        { name: 'hasCallback', type: 'boolean', label: 'Has Callback' },
        { name: 'callbackFailedAt', type: 'number', label: 'Callback Failed At (Unix ms)' },
        { name: 'expiresAt', type: 'number', label: 'Expires At (Unix ms)' },
        { name: 'createdAt', type: 'number', label: 'Created At (Unix ms)' },
        { name: 'updatedAt', type: 'number', label: 'Updated At (Unix ms)' },
        { name: 'openedAt', type: 'number', label: 'Opened At (Unix ms)' },
        { name: 'startedAt', type: 'number', label: 'Started At (Unix ms)' },
        { name: 'lastActivityAt', type: 'number', label: 'Last Activity At (Unix ms)' },
        { name: 'completedAt', type: 'number', label: 'Completed At (Unix ms)' },
        { name: 'expiredAt', type: 'number', label: 'Expired At (Unix ms)' },
        { name: 'canceledAt', type: 'number', label: 'Canceled At (Unix ms)' },
        { name: 'canceledBy', type: 'text', label: 'Canceled By' },
        { name: 'cancelReason', type: 'text', label: 'Cancel Reason' },
        { name: 'dataPurgedAt', type: 'number', label: 'Data Purged At (Unix ms)' },
        { name: 'reminderStep', type: 'integer', label: 'Reminder Step' },
        { name: 'remindersSent', type: 'integer', label: 'Reminders Sent' },
        { name: 'reminderDueAt', type: 'number', label: 'Reminder Due At (Unix ms)' },
        part('answers'),
        part('display'),
        {
            name: 'timeline',
            type: 'array',
            label: 'Timeline',
            help: 'Oldest first: created, invitation, reminder, opened, started, completed, expired, canceled, callback.',
            spec: {
                type: 'collection',
                spec: [
                    { name: 'id', type: 'text', label: 'Entry ID' },
                    { name: 'at', type: 'number', label: 'At (Unix ms)' },
                    { name: 'type', type: 'text', label: 'Entry Type' },
                    { name: 'deliveryStatus', type: 'text', label: 'Delivery Status' },
                    { name: 'attemptCount', type: 'integer', label: 'Attempt Count' },
                    { name: 'eventType', type: 'text', label: 'Callback Event Type' },
                    { name: 'canceledBy', type: 'text', label: 'Canceled By' },
                    { name: 'detail', type: 'text', label: 'Detail' }
                ]
            }
        }
    ]
}
