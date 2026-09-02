/**
 * GPS tracking: devices, position history, and what the app can honestly say about them.
 *
 * Provider-neutral by design. Nothing here knows about a specific tracker vendor, protocol, or map
 * SDK, because none has been chosen. See ARCHITECTURE.md for the ingestion boundary that a real
 * device integration will plug into.
 */

export { TrackingCard } from '@/features/tracking/components/tracking-card';
export { MapScreen } from '@/features/tracking/screens/map-screen';
export {
  describeLocation,
  formatAccuracy,
  formatAge,
  formatBattery,
  formatCoordinates,
  locationBadgeLabel,
  locationTone,
  trackerStatusLabel,
} from '@/features/tracking/tracking-presentation';
export {
  LOCATION_STALE_AFTER_MINUTES,
  usePetTracking,
  type PetTrackingRepositories,
  type PetTrackingState,
} from '@/features/tracking/use-pet-tracking';
