/**
 * The data-access layer. Features depend on these types, never on a database client.
 */

export * from '@/lib/data/ports';
export { createIdFactory, createInMemoryDataSource } from '@/lib/data/in-memory-data-source';
export type { InMemoryOptions, InMemorySeed } from '@/lib/data/in-memory-data-source';
