import React from 'react';
import Svg, { Path } from 'react-native-svg';

export default function PaintStroke({
  color,
  width = 112,
  height = 18,
  flip = false,
}: {
  color: string;
  width?: number;
  height?: number;
  flip?: boolean;
}) {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 112 18"
      style={flip ? { transform: [{ scaleX: -1 }] } : undefined}
    >
      <Path d="M2 11 C22 4 42 10 61 6 C80 2 95 4 110 3 L108 10 C84 11 65 14 45 13 C25 13 13 16 3 15 Z" fill={color} />
      <Path d="M7 16 C28 11 49 16 75 10 C87 8 98 9 106 8" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.55" />
    </Svg>
  );
}