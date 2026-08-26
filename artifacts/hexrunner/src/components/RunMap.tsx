import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import TerritoryPaint from '@/src/components/TerritoryPaint';
import type { TerritoryRoutePoint } from '@/src/services/territoryDisplay';
import type { ExactPresence, AnonymousPresence } from '@workspace/api-client-react';

type RunPoint = {
  lat: number;
  lng: number;
  timestamp: number;
};

type RunMapProps = {
  currentPoint: RunPoint | null;
  pathPoints: readonly TerritoryRoutePoint[];
  claimedHexIndexes: ReadonlySet<string>;
  contestedHexIndexes?: ReadonlySet<string>;
  exactRunners?: readonly ExactPresence[];
  anonymousRunners?: readonly AnonymousPresence[];
  onRunnerPress?: (runner: ExactPresence | AnonymousPresence) => void;
};

/** Browser fallback; Expo Go selects RunMap.native.tsx automatically. */
export default function RunMap({
  currentPoint,
  pathPoints,
  claimedHexIndexes,
  contestedHexIndexes,
  exactRunners,
  anonymousRunners,
  onRunnerPress,
}: RunMapProps) {
  const colors = useColors();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <TerritoryPaint
        center={
          currentPoint
            ? {
                latitude: currentPoint.lat,
                longitude: currentPoint.lng,
              }
            : undefined
        }
        routePoints={pathPoints}
        otherHexIndexes={contestedHexIndexes}
        claimReadyHexIndexes={claimedHexIndexes}
        exactRunners={exactRunners}
        anonymousRunners={anonymousRunners}
        onRunnerPress={onRunnerPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
});