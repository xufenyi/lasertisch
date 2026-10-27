# Stage 2 implementation

Stage 2 provides the browser-based minimum geometry editor. The canonical state
remains independent of Fabric.js and stores integer micrometres, tenths of a
degree, object order, grid settings, and configurable work-area dimensions and
centre.

Implemented interactions include selection, pan, diagonal-corner rectangle
drawing, directed line drawing, 45-degree Shift constraints, square Shift
constraints, grid snapping, live property feedback, blur-based property saving,
and automatic return to Select after drawing.

The default grid interval is 5 mm. Rectangle, line, grid, work-area, and axis
strokes are specified in screen pixels and are inversely adjusted for the current
viewport zoom, keeping their apparent line weight constant while zooming. Grid
lines use the same Fabric vector-line primitive as coordinate axes; the grid omits
X=0 and Y=0 so those positions are drawn exactly once by the axes.

Rectangle resizing uses free width/height scaling by default and proportional
scaling while Shift is held. Resize snapping is projected into canonical geometry
without mutating the active Fabric transform on every pointer event; on commit,
the undragged corner or edge remains fixed. Geometry strokes bypass Fabric's
scale cache so line weight remains visually stable during a resize.

Object names can be edited from the object list. Names are trimmed, limited to
200 characters, and reject control characters plus `< > : " / \\ | ? *`.

The rulers are separate DOM canvas gutters. See `rulers.md` for their coordinate
and layout design.
