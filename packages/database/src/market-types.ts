import type { Types } from 'mongoose';
type ReferenceKey =
  | 'stockId'
  | 'familyId'
  | 'uploadedBy'
  | 'sourceImportBatchId'
  | 'stagingId'
  | 'jobId'
  | 'activeJobId'
  | 'importBatchId'
  | 'changedBy';
type DateKey =
  | 'declaredAt'
  | 'expiresAt'
  | 'confirmedAt'
  | 'leaseUntil'
  | 'startedAt'
  | 'finishedAt'
  | 'changedAt';
type Value<K extends PropertyKey, T, P extends string> = T extends null | undefined
  ? T
  : K extends ReferenceKey
    ? Types.ObjectId
    : K extends DateKey
      ? Date
      : K extends 'volume'
        ? P extends 'columnMapping'
          ? T
          : Types.Decimal128
        : K extends 'open' | 'high' | 'low' | 'close'
          ? P extends 'raw' | 'adjusted'
            ? Types.Decimal128
            : T
          : Stored<T, K extends string ? K : ''>;
/** Contract records mapped to their explicitly declared BSON representations. */
export type Stored<T, Parent extends string = ''> = T extends (infer Item)[]
  ? Stored<Item, Parent>[]
  : T extends object
    ? { [K in keyof T]: Value<K, T[K], Parent> }
    : T;
