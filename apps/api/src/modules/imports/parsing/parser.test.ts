import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  csvFile,
  parseOptions,
  syntheticCalendar,
  xlsxFile,
} from '../../../../tests/parsing-fixtures.js';
import { parseMarketFile } from './parser.js';

describe('isolated parser execution', () => {
  it('resolves the declared source loader from the repository root without NODE_PATH', async () => {
    const script = `
      import { createRequire } from 'node:module';
      const { tsImport } = createRequire(new URL('./apps/api/package.json', import.meta.url))('tsx/esm/api');
      const fixture = await tsImport('./apps/api/tests/parsing-fixtures.ts', import.meta.url);
      const { parseMarketFile } = await tsImport('./apps/api/src/modules/imports/parsing/parser.ts', import.meta.url);
      const result = await parseMarketFile(fixture.csvFile(), fixture.parseOptions, fixture.syntheticCalendar);
      console.log(JSON.stringify({ ready: result.eligibleForConfirmation, count: result.records.length }));
    `;
    const environment = { ...process.env };
    delete environment.NODE_PATH;
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['--input-type=module', '--eval', script],
      {
        cwd: fileURLToPath(new URL('../../../../../../', import.meta.url)),
        env: environment,
        timeout: 15_000,
      },
    );
    expect(JSON.parse(stdout)).toEqual({ ready: true, count: 3 });
  }, 20_000);
  it('parses CSV inside an owned source worker and closes it', async () => {
    const result = await parseMarketFile(csvFile(), parseOptions, syntheticCalendar);
    expect(result.diagnostics).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'PARSER_FAILED' })]),
    );
    expect(result.eligibleForConfirmation).toBe(true);
  });
  it('parses XLSX inside an owned worker without floating-point prices', async () => {
    const result = await parseMarketFile(xlsxFile(), parseOptions, syntheticCalendar);
    expect(result.eligibleForConfirmation).toBe(true);
    expect(result.records[0]?.ohlc.open).toBe('100.0000000000000000000000000000001');
  });
  it('terminates workers at a hard deadline and releases capacity for the next request', async () => {
    const result = await parseMarketFile(csvFile(), parseOptions, syntheticCalendar, {
      timeoutMilliseconds: 1,
    });
    expect(result.diagnostics[0]?.code).toBe('PARSER_TIMEOUT');
    expect(
      (await parseMarketFile(csvFile(), parseOptions, syntheticCalendar)).eligibleForConfirmation,
    ).toBe(true);
  });
  it('bounds concurrent parser workers rather than creating an unbounded queue', async () => {
    const first = parseMarketFile(csvFile(), parseOptions, syntheticCalendar, {
      timeoutMilliseconds: 1,
    });
    const busy = await parseMarketFile(csvFile(), parseOptions, syntheticCalendar);
    expect(busy.diagnostics[0]?.code).toBe('PARSER_BUSY');
    await first;
  });
  it('rejects unsupported files before starting a worker', async () => {
    expect(
      (await parseMarketFile({ ...csvFile(), name: 'file.xlsm' }, parseOptions, null))
        .diagnostics[0]?.code,
    ).toBe('UNSUPPORTED_FILE');
  });
  it('rejects invalid options and attempts to expand the execution budget', async () => {
    await expect(
      parseMarketFile(
        csvFile(),
        { ...parseOptions, mapping: { ...parseOptions.mapping, high: 'Open' } },
        null,
      ),
    ).rejects.toThrow('Explicit stock');
    await expect(
      parseMarketFile(csvFile(), parseOptions, null, { timeoutMilliseconds: 20_000 }),
    ).rejects.toThrow('execution deadline');
  });
});
