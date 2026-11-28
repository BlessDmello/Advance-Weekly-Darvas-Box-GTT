import type { DatabaseConnection } from '@darvas/database';
import { createMarketModels } from '@darvas/database';
/** Privileged synthetic setup only; application inserts require candidate transactions. */
export async function insertSyntheticPrice(connection: DatabaseConnection, input: unknown) {
  if (
    connection.host !== '127.0.0.1' ||
    !/^advanced_darvas_test_[a-f\d]{32}$/.test(connection.name)
  )
    throw new Error('Refusing non-disposable market setup.');
  const model = createMarketModels(connection).DailyPrice;
  const document = new model(input as Record<string, unknown>);
  await document.validate();
  await model.collection.insertOne({
    ...document.toObject({ transform: false }),
    createdAt: new Date(),
    updatedAt: new Date(),
    __v: 0,
  });
  return model.findById(document._id).orFail();
}
export async function insertSyntheticRevision(connection: DatabaseConnection, input: unknown) {
  if (
    connection.host !== '127.0.0.1' ||
    !/^advanced_darvas_test_[a-f\d]{32}$/.test(connection.name)
  )
    throw new Error('Refusing non-disposable market setup.');
  const model = createMarketModels(connection).PriceRevision;
  const document = new model(input as Record<string, unknown>);
  await document.validate();
  await model.collection.insertOne({
    ...document.toObject({ transform: false }),
    createdAt: new Date(),
    updatedAt: new Date(),
    __v: 0,
  });
  return model.findById(document._id).orFail();
}
