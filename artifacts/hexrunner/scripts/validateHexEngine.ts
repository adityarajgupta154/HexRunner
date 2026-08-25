declare const require: (moduleName: string) => unknown;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), message);
}

const OriginalTextDecoder = globalThis.TextDecoder;

class ReactNativeLikeTextDecoder {
  constructor(label = 'utf-8') {
    if (label.toLowerCase() === 'utf-16le') {
      throw new RangeError(
        'Unknown encoding: utf-16le (normalized: utf-16le)',
      );
    }
  }

  decode(): string {
    return '';
  }
}

Object.defineProperty(globalThis, 'TextDecoder', {
  configurable: true,
  writable: true,
  value: ReactNativeLikeTextDecoder,
});

try {
  const {
    hexesFromBoundingBox,
    hexesFromPath,
    hexToPolygon,
    pointToHex,
  } = require('../src/services/hexEngine') as typeof import('../src/services/hexEngine');

  assertEqual(
    globalThis.TextDecoder,
    ReactNativeLikeTextDecoder,
    'The H3 loader must restore React Native TextDecoder after initialization.',
  );

  const bengaluru = pointToHex(12.9716, 77.5946);
  assert(
    /^[0-9a-f]{15}$/.test(bengaluru),
    'pointToHex must return a valid H3 index.',
  );
  const pathHexes = hexesFromPath([
      { lat: 12.9716, lng: 77.5946 },
      { lat: 12.9716, lng: 77.5946 },
    ]);
  assert(
    pathHexes.length === 1 && pathHexes[0] === bengaluru,
    'hexesFromPath must preserve one unique H3 cell.',
  );

  const polygon = hexToPolygon(bengaluru);
  assert(polygon.length >= 5, 'hexToPolygon must return a cell boundary.');
  assert(
    polygon.every(
      ({ latitude, longitude }) =>
        Number.isFinite(latitude) && Number.isFinite(longitude),
    ),
    'hexToPolygon must return finite map coordinates.',
  );

  const visibleHexes = hexesFromBoundingBox({
    north: 12.975,
    south: 12.968,
    east: 77.598,
    west: 77.591,
  });
  assert(
    visibleHexes.includes(bengaluru),
    'The visible H3 grid must include the map center cell.',
  );

  console.log(
    `H3 Android compatibility passed: ${bengaluru}, ${polygon.length} boundary points, ${visibleHexes.length} visible cells.`,
  );
} finally {
  Object.defineProperty(globalThis, 'TextDecoder', {
    configurable: true,
    writable: true,
    value: OriginalTextDecoder,
  });
}