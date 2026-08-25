import { createLogger, setLogLevel, setLogSink, type LogRecord } from '@/lib/logger';
import { AppError } from '@/lib/errors';

function captureRecords() {
  const records: LogRecord[] = [];
  const remove = setLogSink((record) => records.push(record));
  return { records, remove };
}

/** Reads a captured record, failing the test loudly if the logger emitted nothing. */
function recordAt(records: LogRecord[], index: number): LogRecord {
  const record = records[index];
  if (!record) {
    throw new Error(
      `Expected a log record at index ${index}, but only ${records.length} were emitted.`
    );
  }
  return record;
}

describe('logger', () => {
  let capture: ReturnType<typeof captureRecords>;

  beforeEach(() => {
    setLogLevel('debug');
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    capture = captureRecords();
  });

  afterEach(() => {
    capture.remove();
    setLogLevel('silent');
  });

  it('tags every record with its scope', () => {
    createLogger('api').info('fetched pets');
    expect(recordAt(capture.records, 0).scope).toBe('api');
  });

  it('nests scopes through child loggers', () => {
    createLogger('app').child('api').child('pets').debug('cache miss');
    expect(recordAt(capture.records, 0).scope).toBe('app:api:pets');
  });

  it('drops records below the configured level', () => {
    setLogLevel('warn');
    const log = createLogger('test');

    log.debug('ignored');
    log.info('ignored');
    log.warn('kept');
    log.error('kept');

    expect(capture.records.map((record) => record.level)).toEqual(['warn', 'error']);
  });

  it('emits nothing at all when silenced', () => {
    setLogLevel('silent');
    createLogger('test').error('boom', new Error('boom'));
    expect(capture.records).toHaveLength(0);
  });

  it('redacts sensitive keys, including nested ones', () => {
    createLogger('auth').info('signed in', {
      userId: 'u_1',
      apiKey: 'sk-live-123',
      headers: { Authorization: 'Bearer abc' },
    });

    expect(recordAt(capture.records, 0).data).toEqual({
      userId: 'u_1',
      apiKey: '[redacted]',
      headers: { Authorization: '[redacted]' },
    });
  });

  it('normalises a thrown value and lifts its code into the record', () => {
    createLogger('api').error('request failed', new AppError('network', 'offline'));

    const record = recordAt(capture.records, 0);
    expect(record.data).toMatchObject({ code: 'network' });
    expect(record.error).toBeInstanceOf(AppError);
  });

  it('accepts a non-Error throw without blowing up', () => {
    expect(() => createLogger('api').error('odd', 'a string')).not.toThrow();
    expect(recordAt(capture.records, 0).error?.message).toBe('Something went wrong.');
  });

  it('stops delivering to a sink once it is removed', () => {
    capture.remove();
    createLogger('test').info('after removal');
    expect(capture.records).toHaveLength(0);
  });
});
