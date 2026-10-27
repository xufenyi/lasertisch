# Ruler design

The editor uses two 28-pixel, non-interactive ruler gutters outside the Fabric.js
canvas. The horizontal ruler occupies the row above the drawing surface and the
vertical ruler occupies the column to its left, so neither ruler covers geometry
or intercepts pointer input.

Ticks are derived from world coordinates after applying the current pan and zoom
transform. Major spacing is selected dynamically from 0.1, 0.2, 0.5, 1, 2, 5,
10, 20, 50, or 100 mm so labels remain legible. Each major interval has five
minor divisions. The corner identifies the unit as millimetres.

Future extensions can add cursor coordinate indicators or draggable guides in
the gutters without changing the canonical geometry model.
