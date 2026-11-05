import { describe, expect, it } from 'vitest';

import {
  constrainDrawingEnd,
  gridLineCoordinates,
  isRectangleInWorkArea,
  rectangleCenterForFixedResizeAnchor,
  sceneToWorld,
  snapPoint,
  snapRectangleCenter,
  worldToScene,
} from './geometry';
import { DEFAULT_PROCESS, type RectangleEntity } from './model';

const workArea = {
  widthUm: 190_000,
  heightUm: 190_000,
  center: { xUm: 0, yUm: 0 },
};

const base: RectangleEntity = {
  id: 'rectangle',
  kind: 'rectangle',
  name: 'Rectangle',
  process: DEFAULT_PROCESS,
  center: { xUm: 0, yUm: 0 },
  widthUm: 20_000,
  heightUm: 10_000,
  rotationTenthsDeg: 450,
};

describe('world and Fabric scene mapping', () => {
  it('maps the centered, Y-up world to the scene and back', () => {
    const source = { xUm: 12_345, yUm: -4_567 };
    expect(sceneToWorld(worldToScene(source, workArea), workArea)).toEqual(source);
  });

  it('snaps signed coordinates around the world origin', () => {
    expect(snapPoint({ xUm: -1_499, yUm: 1_501 }, 1_000, workArea)).toEqual({
      xUm: -1_000,
      yUm: 2_000,
    });
  });

  it('maps a translated work area while preserving world coordinates', () => {
    const translated = { widthUm: 100_000, heightUm: 80_000, center: { xUm: 20_000, yUm: -10_000 } };
    expect(worldToScene({ xUm: -30_000, yUm: 30_000 }, translated)).toEqual({ x: 0, y: 0 });
    expect(sceneToWorld({ x: 400, y: 320 }, translated)).toEqual({ xUm: 70_000, yUm: -50_000 });
  });
});

describe('rectangle half-grid movement', () => {
  it('preserves aligned edges of a 3 by 5 cell rectangle after moving', () => {
    const center = snapRectangleCenter({ xUm: 2_620, yUm: -3_610 }, 1_000, workArea);
    expect(center).toEqual({ xUm: 2_500, yUm: -3_500 });
    for (const edge of [center.xUm - 1_500, center.xUm + 1_500,
      center.yUm - 2_500, center.yUm + 2_500]) {
      expect(Math.abs(edge % 1_000)).toBe(0);
    }
    expect(snapRectangleCenter(center, 1_000, workArea)).toEqual(center);
  });

  it('allows whole-grid centres and uses the configured grid spacing', () => {
    expect(snapRectangleCenter({ xUm: 2_060, yUm: -1_940 }, 2_000, workArea))
      .toEqual({ xUm: 2_000, yUm: -2_000 });
    expect(snapRectangleCenter({ xUm: 760, yUm: -760 }, 500, workArea))
      .toEqual({ xUm: 750, yUm: -750 });
  });

  it('keeps integer coordinates for odd micrometre grid spacing', () => {
    const center = snapRectangleCenter({ xUm: 501, yUm: -501 }, 1_001, workArea);
    expect(Number.isInteger(center.xUm) && Number.isInteger(center.yUm)).toBe(true);
    expect(snapRectangleCenter(center, 1_001, workArea)).toEqual(center);
  });
});

describe('vector grid lines', () => {
  it('omits the coordinate axes and work-area border lines', () => {
    expect(gridLineCoordinates(-10_000, 10_000, 5_000)).toEqual([
      -5_000,
      5_000,
    ]);
  });

  it('limits extreme grid densities without losing world-grid alignment', () => {
    const coordinates = gridLineCoordinates(-95_000, 95_000, 1, 100);
    expect(coordinates.length).toBeLessThanOrEqual(100);
    expect(coordinates.every((coordinate) => coordinate % 1 === 0)).toBe(true);
    expect(coordinates).not.toContain(0);
  });
});

describe('rotated rectangle bounds', () => {
  it('accepts a rectangle inside the work area', () => {
    expect(isRectangleInWorkArea(base, workArea)).toBe(true);
  });

  it('rejects a rotated rectangle crossing the work area', () => {
    expect(isRectangleInWorkArea({ ...base, center: { xUm: 90_000, yUm: 0 } }, workArea)).toBe(false);
  });
});

describe('Shift drawing constraints', () => {
  it('constrains a rectangle to a square while preserving the drag quadrant', () => {
    expect(constrainDrawingEnd('rectangle', { xUm: 0, yUm: 0 }, { xUm: -3_000, yUm: 5_000 }, true))
      .toEqual({ xUm: -5_000, yUm: 5_000 });
  });

  it('constrains a line to the nearest 45 degree direction', () => {
    const end = constrainDrawingEnd('line', { xUm: 0, yUm: 0 }, { xUm: 10_000, yUm: 1_000 }, true);
    expect(end.yUm).toBe(0);
    expect(end.xUm).toBeGreaterThan(10_000);
    const diagonal = constrainDrawingEnd('line', { xUm: 0, yUm: 0 }, { xUm: 8_000, yUm: 6_000 }, true);
    expect(diagonal.xUm).toBe(diagonal.yUm);
  });
});

describe('snapped rectangle resize anchor', () => {
  it('keeps the opposite corner fixed when snapped dimensions change', () => {
    const rectangle: RectangleEntity = {
      ...base,
      widthUm: 10_000,
      heightUm: 10_000,
      rotationTenthsDeg: 0,
    };
    expect(rectangleCenterForFixedResizeAnchor(rectangle, 20_000, 30_000, 'br'))
      .toEqual({ xUm: 5_000, yUm: -10_000 });
  });

  it('keeps the opposite edge fixed for a side-handle resize', () => {
    const rectangle: RectangleEntity = {
      ...base,
      widthUm: 10_000,
      heightUm: 10_000,
      rotationTenthsDeg: 0,
    };
    expect(rectangleCenterForFixedResizeAnchor(rectangle, 14_000, 10_000, 'mr'))
      .toEqual({ xUm: 2_000, yUm: 0 });
  });
});

