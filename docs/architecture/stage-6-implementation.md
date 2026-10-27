# Stage 6 implementation

Stage 6 maps the accepted device-independent toolpath to the target device's
absolute `jump` and `mark` commands, then encodes the same ordered command stream
as CSV or DBD.

## Command semantics

- The preamble always becomes the first `jump` to world `(0, 0)`, even though
  the device's starting position is unknown.
- Every toolpath segment becomes exactly one command whose target is the segment
  end. Laser-off travel becomes `jump`; contour, hatch and open-line marking
  become `mark`.
- A `mark` therefore enables the laser during movement from the previous command
  point to the current command point, matching the clarified device semantics.
- Coordinates and speeds are converted from integer µm / µm/s to mm / mm/s only
  at this boundary. No axis inversion or extra quantisation is applied.
- The mapper rejects stale revisions, discontinuous paths, reordered sequence
  numbers, and task mismatches before encoding.
- No return-to-origin or other final parking command is added; the program ends
  at the last planned point.

## File encoders

Both formats use the existing `csv-dbd-converter` package:

- CSV contains `command,x,y,speed` in UTF-8 with absolute millimetre values.
- DBD uses the verified target-device opcodes, header parameters, little-endian
  float32 inch coordinates/speeds, and per-motion-type speed changes.
- The repository's `csv_dbd/test.csv` and `csv_dbd/test.dbd` remain the binary
  golden pair; automated tests require the encoder to reproduce it byte for byte.

The application bridge returns base64 file bytes so the same API works in the
browser development transport and the future pywebview desktop shell.

## Room for advanced geometry

Stage 5 is intentionally deferred until arbitrary polygon editing is available.
The export boundary accepts only `ToolpathPlan`, never editor entities, so adding
polygons, holes, curves converted to paths, or applied boolean results will not
change CSV/DBD generation.

The canonical Python model already represents polygons as one or more parts,
each with an outer ring and zero or more holes. The future frontend extension
should add new discriminated entity variants and Fabric adapters while keeping
the canonical document and planner contracts versioned. Applied boolean results
will be stored as new polygon entities; boolean implementation must not be added
to the device encoder.

## Manual acceptance

1. Start the development app and draw at least one line and one rectangle.
2. Set visibly different travel and mark speeds, then open the download menu.
3. Export CSV and confirm its first command is `jump,0,0,...`; later rows follow
   the preview/object order and use `jump` for dashed travel and `mark` for laser
   paths.
4. Export DBD and confirm the download has a `.dbd` extension and non-zero size.
5. Turn path preview off, modify geometry, and export again. Export must still
   plan the current document rather than using the previous path.
6. Change a line's endpoint order and confirm the exported mark direction changes
   accordingly; no automatic endpoint reversal or final parking move is added.
