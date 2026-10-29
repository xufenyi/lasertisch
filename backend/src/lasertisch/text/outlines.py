"""Shape a basic single line and bake its non-zero filled glyphs into straight rings."""
from __future__ import annotations

import hashlib
from io import BytesIO
import math
from uuid import UUID, uuid4

import fontTools
from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont
import uharfbuzz as hb
from shapely.affinity import translate
from shapely.geometry import GeometryCollection, LineString, MultiPolygon, Polygon
from shapely.ops import polygonize, unary_union

from lasertisch.domain.bridge import ApiIssue
from lasertisch.domain.models import PointUm, PolygonEntity, PolygonPart, ProcessSpec
from lasertisch.domain.text import MAX_TEXT_VERTICES, TextOutlineSnapshot, TextParameters, TextSource, canonical_hash
from lasertisch.geometry.conversion import closed_entity_to_geometry
from lasertisch.geometry.precision import coordinate_to_point_um, snap_geometry
from .errors import TextGeometryError
from .fonts import FONT_REPOSITORY, FontRepository
from .short_segments import merge_short_segments


def _mid(a, b):
    return ((a[0]+b[0])/2, (a[1]+b[1])/2)


def _distance_to_chord(point, a, b):
    dx, dy = b[0]-a[0], b[1]-a[1]
    length = dx*dx + dy*dy
    if not length:
        return math.hypot(point[0]-a[0], point[1]-a[1])
    ratio = max(0, min(1, ((point[0]-a[0])*dx + (point[1]-a[1])*dy)/length))
    return math.hypot(point[0]-a[0]-ratio*dx, point[1]-a[1]-ratio*dy)


class FlattenPen(BasePen):
    """Adaptive chord approximation before micron rounding, including composites."""
    def __init__(self, glyph_set, scale: float, tolerance: float):
        super().__init__(glyph_set)
        self.scale = scale
        self.tolerance = tolerance
        self.contours = []
        self.points = []
        self.current = None
        self.count = 0

    def _point(self, point):
        result = (point[0]*self.scale, point[1]*self.scale)
        if not all(math.isfinite(value) for value in result):
            raise TextGeometryError("text.invalid_outline")
        return result

    def _append(self, point):
        if not self.points or self.points[-1] != point:
            self.points.append(point)
            self.count += 1
            if self.count > MAX_TEXT_VERTICES:
                raise TextGeometryError("text.too_complex")
        self.current = point

    def _moveTo(self, point):
        if self.points:
            raise TextGeometryError("text.open_contour")
        self._append(self._point(point))

    def _lineTo(self, point):
        self._append(self._point(point))

    def _quadratic(self, a, b, c, depth=0):
        if _distance_to_chord(b, a, c) <= self.tolerance:
            self._append(c)
            return
        if depth >= 24:
            raise TextGeometryError("text.too_complex")
        ab, bc = _mid(a,b), _mid(b,c)
        middle = _mid(ab,bc)
        self._quadratic(a,ab,middle,depth+1)
        self._quadratic(middle,bc,c,depth+1)

    def _qCurveToOne(self, control, end):
        self._quadratic(self.current, self._point(control), self._point(end))

    def _cubic(self, a, b, c, d, depth=0):
        if max(_distance_to_chord(b,a,d), _distance_to_chord(c,a,d)) <= self.tolerance:
            self._append(d)
            return
        if depth >= 24:
            raise TextGeometryError("text.too_complex")
        ab,bc,cd = _mid(a,b),_mid(b,c),_mid(c,d)
        abc,bcd = _mid(ab,bc),_mid(bc,cd)
        middle = _mid(abc,bcd)
        self._cubic(a,ab,abc,middle,depth+1)
        self._cubic(middle,bcd,cd,d,depth+1)

    def _curveToOne(self, control1, control2, end):
        self._cubic(self.current, self._point(control1), self._point(control2), self._point(end))

    def _closePath(self):
        if len(self.points)>1 and self.points[0]==self.points[-1]:
            self.points.pop()
        if len(self.points)>=3:
            self.contours.append(self.points)
        self.points = []
        self.current = None

    def _endPath(self):
        if self.points:
            raise TextGeometryError("text.open_contour")


def _winding(point, contours):
    x,y = point
    winding = 0
    for ring in contours:
        for a,b in zip(ring,ring[1:]+ring[:1]):
            cross = (b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0])
            if a[1] <= y < b[1] and cross > 0:
                winding += 1
            elif b[1] <= y < a[1] and cross < 0:
                winding -= 1
    return winding


def filled_contours(contours):
    """Polygonize the glyph arrangement, then apply the font's non-zero rule."""
    lines = [LineString([(x/1000,y/1000) for x,y in ring+ring[:1]]) for ring in contours]
    if not lines:
        return GeometryCollection()
    faces = polygonize(unary_union(lines))
    selected = []
    for face in faces:
        point = face.representative_point()
        if _winding((point.x*1000,point.y*1000),contours):
            selected.append(face)
    return unary_union(selected) if selected else GeometryCollection()


def _polygons(geometry):
    if isinstance(geometry, Polygon):
        return [] if geometry.is_empty else [geometry]
    if isinstance(geometry, (MultiPolygon,GeometryCollection)):
        return [polygon for child in geometry.geoms for polygon in _polygons(child)]
    return []


def _topology(geometry):
    polygons = _polygons(geometry)
    return len(polygons), sum(len(polygon.interiors) for polygon in polygons)


def generate_text_outline(parameters: TextParameters, repository: FontRepository = FONT_REPOSITORY):
    record = repository.resolve(parameters.font_id)
    try:
        data = record.path.read_bytes()
    except OSError as error:
        raise TextGeometryError("font.unavailable") from error
    if hashlib.sha256(data).hexdigest() != record.descriptor.fingerprint:
        raise TextGeometryError("font.changed")
    face = hb.Face(data, record.descriptor.face_index)
    font = hb.Font(face)
    font.scale = (face.upem,face.upem)
    buffer = hb.Buffer()
    buffer.add_str(parameters.content)
    buffer.guess_segment_properties()
    hb.shape(font,buffer)
    infos, positions = buffer.glyph_infos, buffer.glyph_positions
    missing = [info.cluster for info in infos if info.codepoint == 0]
    if missing:
        labels = sorted({f"U+{ord(parameters.content[min(index,len(parameters.content)-1)]):04X}" for index in missing})
        raise TextGeometryError("text.missing_glyphs", characters=", ".join(labels))
    scale = parameters.font_size_um / face.upem
    x,y = 0,0
    cache = {}
    geometries = []
    point_count = 0
    with TTFont(BytesIO(data),fontNumber=record.descriptor.face_index) as tt:
        glyph_set, order = tt.getGlyphSet(), tt.getGlyphOrder()
        for info,position in zip(infos,positions,strict=True):
            glyph_id = info.codepoint
            if glyph_id not in cache:
                # The control-point chord test bounds the actual quadratic by
                # 1/2 tolerance and cubic by 3/4 tolerance (Bernstein weights).
                # Reserve the remaining 1/4 for merging; use the same initial
                # sampling whether merging is enabled or disabled.
                pen = FlattenPen(glyph_set,scale,parameters.curve_tolerance_um)
                glyph_set[order[glyph_id]].draw(pen)
                filled = filled_contours(pen.contours)
                if pen.count and filled.is_empty:
                    raise TextGeometryError("text.no_outline")
                cache[glyph_id] = filled, pen.count
            geometry,count = cache[glyph_id]
            point_count += count
            if point_count > MAX_TEXT_VERTICES:
                raise TextGeometryError("text.too_complex")
            if not geometry.is_empty:
                placed = translate(geometry,(x+position.x_offset)*scale/1000,(y+position.y_offset)*scale/1000)
                if snap_geometry(placed).is_empty:
                    raise TextGeometryError("text.too_small")
                geometries.append(placed)
            x += position.x_advance
            y += position.y_advance
    if not geometries:
        raise TextGeometryError("text.no_outline")
    raw = unary_union(geometries)
    warnings = []
    if parameters.short_segment_target_um:
        raw,limited = merge_short_segments(raw,parameters.short_segment_target_um,parameters.curve_tolerance_um/4)
        if limited:
            warnings.append(ApiIssue(code="text.simplification_limited"))
    geometry = snap_geometry(raw).normalize()
    polygons = _polygons(geometry)
    if not polygons:
        raise TextGeometryError("text.too_small")
    if _topology(raw) != _topology(geometry):
        warnings.append(ApiIssue(code="text.details_changed_at_precision"))
    parts = [PolygonPart(
        outer_ring=[coordinate_to_point_um((px,py)) for px,py in list(polygon.exterior.coords)[:-1]],
        holes=[[coordinate_to_point_um((px,py)) for px,py in list(ring.coords)[:-1]] for ring in polygon.interiors],
    ) for polygon in polygons]
    source = TextSource(content=parameters.content,font=record.descriptor.model_copy(deep=True),
        font_size_um=parameters.font_size_um,curve_tolerance_um=parameters.curve_tolerance_um,
        short_segment_target_um=parameters.short_segment_target_um)
    snapshot = TextOutlineSnapshot(
        source=source, source_hash=canonical_hash(source.model_dump(mode="json",by_alias=True)),
        geometry_hash=canonical_hash([part.model_dump(mode="json",by_alias=True) for part in parts]),
        parts=parts,advance_um=math.floor(abs(x*scale)+0.5),glyph_count=len(infos),
        engine_versions={"fonttools":fontTools.__version__,"uharfbuzz":hb.__version__,"harfbuzz":hb.version_string()},
    )
    if parameters.short_segment_target_um:
        lengths=[math.hypot(a.x_um-b.x_um,a.y_um-b.y_um) for part in parts for ring in (part.outer_ring,*part.holes)
                 for a,b in zip(ring,ring[1:]+ring[:1])]
        count=sum(length<parameters.short_segment_target_um for length in lengths)
        if count:
            warnings.append(ApiIssue(code="text.short_segments_remain",parameters={"count":count}))
    return snapshot,warnings


def outline_to_polygon(snapshot: TextOutlineSnapshot, *, entity_id: UUID | None = None,
    name="Text outline", position: PointUm | None = None, rotation_tenths_deg=0,
    process: ProcessSpec | None = None) -> PolygonEntity:
    polygon = PolygonEntity(id=entity_id or uuid4(),name=name,position=position or PointUm(x_um=0,y_um=0),
        rotation_tenths_deg=rotation_tenths_deg,process=process or ProcessSpec(),
        parts=[part.model_copy(deep=True) for part in snapshot.parts])
    closed_entity_to_geometry(polygon)
    return polygon
