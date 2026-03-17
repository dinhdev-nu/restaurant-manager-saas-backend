// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySchema = Record<string, any>;

const META_PROPS = {
    success:       { type: 'boolean',  example: true },
    statusCode:    { type: 'number',   example: 200 },
    message:       { type: 'string',   example: 'Request was successful' },
    correlationId: { type: 'string',   example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
    timestamp:     { type: 'string',   format: 'date-time', example: '2026-03-13T10:00:00.000Z' },
};

/** Wraps a data schema with the standard API response envelope. */
export function swWrap(dataSchema?: AnySchema, messageExample?: string): AnySchema {
    return {
        properties: {
            ...META_PROPS,
            ...(messageExample ? { message: { type: 'string', example: messageExample } } : {}),
            data: dataSchema ?? { nullable: true, example: null },
        },
    };
}

/** Convenience for endpoints that only return a success message (no meaningful data). */
export function swMsg(messageExample: string): AnySchema {
    return swWrap(undefined, messageExample);
}
