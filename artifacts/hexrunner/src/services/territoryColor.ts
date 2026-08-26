import type { TerritoryColor } from '@workspace/api-client-react';

export const TERRITORY_COLORS: Record<TerritoryColor, string> = {
  amber: '#FFD60A',
  cyan: '#00FFFF',
  emerald: '#00FF00',
  fuchsia: '#FF00FF',
  violet: '#BF5AF2',
};

export const DEFAULT_RIVAL_COLOR = '#FF3B30';
export const DEFAULT_OWNER_COLOR = '#00FF00';

export function getTerritoryColor(color?: TerritoryColor | null): string | undefined {
  return color ? TERRITORY_COLORS[color] : undefined;
}
