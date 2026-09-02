/**
 * The data-access layer. Features depend on these types, never on a database client.
 */

export * from '@/lib/data/ports';
export { getAuthRepository, resetAuthRepository } from '@/lib/data/auth';
export { getPetRepository, resetPetRepository } from '@/lib/data/pets';
export type { CreateAuthRepositoryOptions } from '@/lib/data/auth';
export { createIdFactory, createInMemoryDataSource } from '@/lib/data/in-memory-data-source';
export type { InMemoryOptions, InMemorySeed } from '@/lib/data/in-memory-data-source';
