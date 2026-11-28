import { Schema, type SchemaDefinition } from 'mongoose';
import { z } from 'zod';

type JsonSchema = Record<string, unknown>;
export const objectIdFields = new Set([
  'stockId',
  'familyId',
  'uploadedBy',
  'sourceImportBatchId',
  'stagingId',
  'jobId',
  'activeJobId',
  'importBatchId',
  'changedBy',
]);

function shape(node: JsonSchema, key: string, required: boolean): unknown {
  const choices = node.anyOf as JsonSchema[] | undefined;
  if (choices) {
    const present = choices.find((entry) => entry.type !== 'null');
    if (!present || choices.length !== 2 || !choices.some((entry) => entry.type === 'null'))
      throw new Error('Unsupported market field union.');
    const field = shape(present, key, false) as { validate?: (value: unknown) => boolean };
    const validate = field.validate;
    return {
      ...field,
      default: null,
      required: false,
      ...(validate
        ? { validate: (value: unknown) => value === null || value === undefined || validate(value) }
        : {}),
    };
  }
  if (objectIdFields.has(key)) return { type: Schema.Types.ObjectId, required };
  if (node.format === 'date-time') return { type: Date, required };
  if (node.type === 'object')
    return {
      type: new Schema(definition(node), { _id: false, versionKey: false, strict: 'throw' }),
      required,
    };
  if (node.type === 'array')
    return { type: [shape(node.items as JsonSchema, '', true)], required, default: undefined };
  if (node.type === 'number' || node.type === 'integer')
    return {
      type: Number,
      required,
      ...(node.minimum !== undefined ? { min: node.minimum } : {}),
      ...(node.maximum !== undefined ? { max: node.maximum } : {}),
      ...(node.type === 'integer' ? { validate: Number.isSafeInteger } : {}),
    };
  if (node.type === 'boolean') return { type: Boolean, required };
  if (node.type !== 'string') throw new Error('Unsupported market contract field.');
  return {
    type: String,
    required,
    ...(node.maxLength !== undefined ? { maxlength: node.maxLength } : {}),
    ...(node.enum ? { enum: node.enum } : {}),
    ...(node.const !== undefined ? { enum: [node.const] } : {}),
    ...(node.pattern ? { match: new RegExp(String(node.pattern)) } : {}),
  };
}
function definition(node: JsonSchema): SchemaDefinition {
  const properties = node.properties as Record<string, JsonSchema>;
  const required = node.required as string[] | undefined;
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [
      key,
      shape(value, key, required?.includes(key) ?? false),
    ]),
  ) as SchemaDefinition;
}
/** Metadata only: price series use explicit Decimal128 definitions, never JS Number. */
export function metadataSchema(contract: z.ZodType): Schema {
  return new Schema(definition(z.toJSONSchema(contract) as JsonSchema), {
    _id: false,
    versionKey: false,
    strict: 'throw',
  });
}
