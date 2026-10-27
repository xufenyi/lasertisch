# Stage 3 implementation

Stage 3 adds document lifecycle and processing metadata to the accepted Stage 2
editor baseline.

## Project files

The frontend document now matches the version 1 Python `ProjectDocument`
contract, including document identity, project name, default process settings,
global settings, entities, and complete processing order. Loading performs strict
runtime checks for units, integer precision, IDs, geometry bounds, supported
entity types, process compatibility, and total processing order before replacing
the current document.

The browser build uses a file input for Open and a JSON download for Save. This
keeps Stage 3 independently testable; Stage 7 will route the same serialization
through native pywebview file dialogs without changing the document model.

## History

The Zustand store owns a bounded 100-entry document history. Only committed
canonical document changes enter history. Fabric pointer-move previews remain
transient, so one completed drag or resize creates one undo entry instead of one
entry per mouse event. New and loaded projects reset history; save records the
current document fingerprint for dirty-state tracking.

## Processing parameters and order

Single and multi-selection panels edit process mode and marking speed. Fill angle,
hatch spacing, and contour direction are available only when all selected objects
are closed geometry. Mixed values are displayed without writing them back until
the user explicitly changes a field. Default processing parameters apply to newly
drawn objects.

Processing order is a separate total ordering and can be moved earlier or later
without changing geometry storage or canvas stacking. Global travel speed is
editable; the 0.1 mm minimum mark segment and initial jump to world origin remain
fixed by the version 1 contract.
