/**
 * The domain model: the vocabulary the rest of the app is written in.
 *
 * Pure TypeScript — no React, no navigation, no database client. Everything here is a type, a
 * constant, or a pure function, which is what lets it be imported by any layer and tested without
 * a harness.
 */

export * from '@/lib/domain/access';
export * from '@/lib/domain/alert';
export * from '@/lib/domain/auth';
export * from '@/lib/domain/geo';
export * from '@/lib/domain/ids';
export * from '@/lib/domain/location';
export * from '@/lib/domain/pet';
export * from '@/lib/domain/pet-share';
export * from '@/lib/domain/profile';
export * from '@/lib/domain/safe-zone';
export * from '@/lib/domain/tracker';
export * from '@/lib/domain/validation';
