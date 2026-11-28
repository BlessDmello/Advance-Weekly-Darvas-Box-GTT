import {
  createMarketModels,
  createMarketRepository,
  marketFingerprint,
  stockReferenceFingerprint,
  prepareMarketStorage,
  verifyMarketStorage,
} from '@darvas/database';
import type { MarketReferencePolicy } from '@darvas/contracts';
import type { startAuthFixture } from '../../../tests/support/mongo.js';
import { syntheticStock } from '../../../tests/support/market-records.js';
import { parseOptions, syntheticCalendar } from './parsing-fixtures.js';
import type { MarketDependencies } from '../src/modules/imports/service.js';

/** Startup-only disposable fixtures. Never imported by the production server/build. */
export async function importTestDependencies(
  fixture: Awaited<ReturnType<typeof startAuthFixture>>,
): Promise<MarketDependencies> {
  fixture.assertOwned();
  await prepareMarketStorage(fixture.connection, true);
  const models = createMarketModels(fixture.connection);
  const policy: MarketReferencePolicy = {
    stocks: [],
    calendars: [
      {
        source: syntheticCalendar.source,
        version: syntheticCalendar.version,
        from: syntheticCalendar.from,
        to: syntheticCalendar.to,
        fingerprint: marketFingerprint(syntheticCalendar.days),
      },
    ],
    priceSources: [
      {
        provider: parseOptions.source.provider,
        reference: parseOptions.source.reference,
        basis: 'RAW',
        adjustmentVersion: null,
      },
    ],
  };
  for (const symbol of [
    'SYNTH-DESK',
    'SYNTH-MOB',
    'UI-DESK-CSV',
    'UI-MOB-CSV',
    'UI-DESK-XLSX',
    'UI-MOB-XLSX',
  ]) {
    const stock = { ...syntheticStock(), symbol };
    const document = await models.Stock.create(stock);
    policy.stocks.push({ stockId: document.id, fingerprint: stockReferenceFingerprint(stock) });
  }
  for (const day of syntheticCalendar.days) await models.TradingSession.create(day);
  return {
    policy: () => policy,
    repository: async () => {
      fixture.assertOwned();
      await verifyMarketStorage(fixture.connection);
      return createMarketRepository(fixture.connection);
    },
  };
}
