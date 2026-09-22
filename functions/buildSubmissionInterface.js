/**
 * Builds the Watch Submissions output interface from `fields.list`.
 *
 * Every event is the formbase envelope `{ id, type, createdAt, apiVersion,
 * test, data }`. The envelope half is fixed; the per-form half is not, so the
 * `data.answers` and `data.display` collections are filled from the published
 * field list of the selected form: one item per field key, labelled with the
 * question title a person recognises.
 *
 * Called from `rpcs/get_submission_interface/api.imljson` as
 * `{{buildSubmissionInterface(body.data.items)}}`. With no items (a form whose
 * field list is empty) it returns the envelope alone, so the module stays
 * mappable.
 */
function buildSubmissionInterface(items) {
    // formbase question input type -> Make interface type. Anything unlisted
    // stays `any`: the stored value keeps its own JSON shape in data.answers.
    var TYPE_BY_INPUT_TYPE = {
        text: 'text',
        textarea: 'text',
        email: 'email',
        phone: 'text',
        url: 'url',
        number: 'number',
        rating: 'number',
        scale: 'number',
        switch: 'boolean',
        date: 'date',
        time: 'text',
        radio: 'text',
        select: 'text',
        signature: 'text',
        hidden: 'text'
    }

    var list = Array.isArray(items) ? items : []
    var answerSpec = []
    var displaySpec = []

    for (var index = 0; index < list.length; index++) {
        var item = list[index]
        if (!item || typeof item.key !== 'string') continue

        // A repeating group is an array of rows, each row keyed by member field key.
        if (Array.isArray(item.members)) {
            var memberSpec = []
            for (var m = 0; m < item.members.length; m++) {
                var member = item.members[m]
                if (!member || typeof member.key !== 'string') continue
                memberSpec.push({
                    name: member.key,
                    type: TYPE_BY_INPUT_TYPE[member.type] || 'any',
                    label: member.title || member.key
                })
            }
            answerSpec.push({
                name: item.key,
                type: 'array',
                label: item.key,
                spec: { type: 'collection', spec: memberSpec }
            })
            displaySpec.push({ name: item.key, type: 'text', label: item.key + ' (display)' })
            continue
        }

        answerSpec.push({
            name: item.key,
            type: TYPE_BY_INPUT_TYPE[item.type] || 'any',
            label: item.title || item.key
        })
        displaySpec.push({ name: item.key, type: 'text', label: (item.title || item.key) + ' (display)' })
    }

    return [
        { name: 'id', type: 'text', label: 'Event ID' },
        { name: 'type', type: 'text', label: 'Event Type' },
        { name: 'createdAt', type: 'date', label: 'Event Timestamp' },
        { name: 'apiVersion', type: 'text', label: 'API Version' },
        { name: 'test', type: 'boolean', label: 'Test Event' },
        {
            name: 'data',
            type: 'collection',
            label: 'Data',
            spec: [
                {
                    name: 'form',
                    type: 'collection',
                    label: 'Form',
                    spec: [
                        { name: 'id', type: 'text', label: 'Form ID' },
                        { name: 'name', type: 'text', label: 'Form Name' },
                        { name: 'snapshotId', type: 'text', label: 'Published Version ID' }
                    ]
                },
                {
                    name: 'submission',
                    type: 'collection',
                    label: 'Submission',
                    spec: [
                        { name: 'id', type: 'text', label: 'Submission ID' },
                        { name: 'respondentEmail', type: 'email', label: 'Respondent Email' },
                        { name: 'submittedAt', type: 'date', label: 'Submitted At' },
                        { name: 'pdfUrl', type: 'url', label: 'Submission PDF Link' },
                        { name: 'language', type: 'text', label: 'Submission Language' }
                    ]
                },
                {
                    name: 'answers',
                    type: 'collection',
                    label: 'Answers',
                    help: 'Every answer keyed by field key. A repeating group is an array of rows keyed by member field key.',
                    spec: answerSpec
                },
                {
                    name: 'display',
                    type: 'collection',
                    label: 'Answers (display)',
                    help: 'Human-readable text for every answer, under the same keys as Answers.',
                    spec: displaySpec
                },
                {
                    name: 'request',
                    type: 'collection',
                    label: 'Request',
                    help: 'Present only when the submission answered a request.',
                    spec: [
                        { name: 'id', type: 'text', label: 'Request ID' },
                        { name: 'externalId', type: 'text', label: 'External ID' },
                        { name: 'metadata', type: 'any', label: 'Metadata' }
                    ]
                }
            ]
        }
    ]
}
