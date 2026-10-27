# Stage 4 implementation

Stage 4 connects the accepted document editor to the Python/Shapely CAM planner
and renders the resulting device-independent motion plan in the editor.

## Application bridge

`lasertisch.application.ApplicationApi` validates `PlanRequest`, calls the pure
CAM planner, and returns the versioned `PlanResponse` contract. Planning and
validation failures are converted to stable issue codes rather than UI text.

During browser development, a small Vite middleware invokes the same API through
the project Python environment. It exists only as a development transport and
does not add a web framework or a production server. A production desktop window
can expose `ApplicationApi.plan_toolpaths` as `pywebview.api.plan_toolpaths`
without changing the frontend client.

## Automatic planning

Every committed canonical document update increments `documentRevision`. The
frontend waits 250 ms, sends the complete document, and accepts a response only
when its request identity and revision match. A superseded request is aborted
where possible and its late result is ignored. Fabric pointer-move previews do
not trigger Python calls until the drag is committed.

## Preview layer

Toolpaths are rendered on one non-interactive Canvas2D overlay rather than as
hundreds of selectable Fabric objects. The overlay shares Fabric's current pan
and zoom transform and is repainted after Fabric rendering.

- Red solid paths: contour and directed open-line marking.
- Orange solid paths: hatch marking.
- Grey dashed paths: laser-off travel.
- Arrowheads: mark direction.
- Numbered badges: forced object processing order.
- Green `S` and red `E`: post-preamble start and final endpoint.

The initial jump has an unknown device start and therefore is represented by the
green world-origin start marker instead of an invented line.
