type HexGridProps = {
  hexIndexes: string[];
  claimedHexIndexes?: ReadonlySet<string>;
};

/**
 * Browser fallback. The native implementation is selected automatically by
 * Metro from HexGrid.native.tsx when the app runs in Expo Go.
 */
export default function HexGrid(_props: HexGridProps) {
  return null;
}