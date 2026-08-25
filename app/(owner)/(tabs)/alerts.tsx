import { EmptyState, Screen } from '@/components/ui';

/** Alerts. Placeholder for reminders and notifications. */
export default function AlertsScreen() {
  return (
    <Screen centered testID="alerts-screen">
      <EmptyState
        icon="alerts"
        title="No alerts"
        description="Reminders, vet appointments, and anything else needing attention will show up here."
      />
    </Screen>
  );
}
