from collections import defaultdict
from uuid import UUID

from shapely.geometry import Point

from lasertisch.cam.hatch import hatch_segments
from lasertisch.domain.models import PointUm, PolygonEntity, PolygonPart, RectangleEntity
from lasertisch.geometry import closed_entity_to_geometry


ENTITY_ID = UUID("20000000-0000-0000-0000-000000000001")


def rectangle(
    *, width_um: int = 10_000, height_um: int = 10_000, rotation: int = 0
) -> RectangleEntity:
    return RectangleEntity(
        id=ENTITY_ID,
        name="Rectangle",
        center=PointUm(x_um=0, y_um=0),
        width_um=width_um,
        height_um=height_um,
        rotation_tenths_deg=rotation,
    )


def test_horizontal_hatch_is_world_anchored_and_includes_boundary_lines() -> None:
    segments = hatch_segments(
        closed_entity_to_geometry(rectangle()),
        angle_tenths_deg=0,
        spacing_um=1_000,
        minimum_length_um=100,
    )

    assert len(segments) == 11
    assert segments[0].start == PointUm(x_um=-5_000, y_um=-5_000)
    assert segments[0].end == PointUm(x_um=5_000, y_um=-5_000)
    assert segments[1].start == PointUm(x_um=5_000, y_um=-4_000)
    assert segments[1].end == PointUm(x_um=-5_000, y_um=-4_000)
    assert {segment.start.y_um for segment in segments} == set(
        range(-5_000, 5_001, 1_000)
    )


def test_object_rotation_does_not_rotate_world_horizontal_hatch() -> None:
    segments = hatch_segments(
        closed_entity_to_geometry(rectangle(rotation=450)),
        angle_tenths_deg=0,
        spacing_um=1_000,
        minimum_length_um=100,
    )

    assert segments
    assert all(segment.start.y_um == segment.end.y_um for segment in segments)
    assert all(segment.start.y_um % 1_000 == 0 for segment in segments)


def test_hole_produces_two_mark_segments_on_one_scanline() -> None:
    polygon = PolygonEntity(
        id=ENTITY_ID,
        name="Holed square",
        parts=[
            PolygonPart(
                outer_ring=[
                    PointUm(x_um=-5_000, y_um=-5_000),
                    PointUm(x_um=5_000, y_um=-5_000),
                    PointUm(x_um=5_000, y_um=5_000),
                    PointUm(x_um=-5_000, y_um=5_000),
                ],
                holes=[
                    [
                        PointUm(x_um=-1_000, y_um=-1_000),
                        PointUm(x_um=1_000, y_um=-1_000),
                        PointUm(x_um=1_000, y_um=1_000),
                        PointUm(x_um=-1_000, y_um=1_000),
                    ]
                ],
            )
        ],
    )

    segments = hatch_segments(
        closed_entity_to_geometry(polygon), 0, 1_000, 100
    )
    rows = defaultdict(list)
    for segment in segments:
        rows[segment.row_index].append(segment)
    center_row = next(
        row for row in rows.values() if row[0].start.y_um == 0
    )

    assert len(center_row) == 2
    covered_intervals = sorted(
        (min(item.start.x_um, item.end.x_um), max(item.start.x_um, item.end.x_um))
        for item in center_row
    )
    assert covered_intervals == [(-5_000, -1_000), (1_000, 5_000)]


def test_disconnected_regions_remain_separate_segments() -> None:
    polygon = PolygonEntity(
        id=ENTITY_ID,
        name="Two islands",
        parts=[
            PolygonPart(
                outer_ring=[
                    PointUm(x_um=-5_000, y_um=-1_000),
                    PointUm(x_um=-2_000, y_um=-1_000),
                    PointUm(x_um=-2_000, y_um=1_000),
                    PointUm(x_um=-5_000, y_um=1_000),
                ]
            ),
            PolygonPart(
                outer_ring=[
                    PointUm(x_um=2_000, y_um=-1_000),
                    PointUm(x_um=5_000, y_um=-1_000),
                    PointUm(x_um=5_000, y_um=1_000),
                    PointUm(x_um=2_000, y_um=1_000),
                ]
            ),
        ],
    )

    segments = hatch_segments(
        closed_entity_to_geometry(polygon), 0, 1_000, 100
    )
    center = [segment for segment in segments if segment.start.y_um == 0]

    assert len(center) == 2


def test_quantized_scan_segment_shorter_than_point_one_mm_is_removed() -> None:
    segments = hatch_segments(
        closed_entity_to_geometry(rectangle(width_um=99, height_um=1_000)),
        angle_tenths_deg=0,
        spacing_um=1_000,
        minimum_length_um=100,
    )

    assert segments == []


def test_quantized_scan_segment_exactly_point_one_mm_is_kept() -> None:
    segments = hatch_segments(
        closed_entity_to_geometry(rectangle(width_um=100, height_um=1_000)),
        angle_tenths_deg=0,
        spacing_um=1_000,
        minimum_length_um=100,
    )

    assert len(segments) == 1
    assert {segments[0].start.x_um, segments[0].end.x_um} == {-50, 50}


def test_concave_polygon_never_marks_across_missing_region() -> None:
    polygon = PolygonEntity(
        id=ENTITY_ID,
        name="Concave L",
        parts=[
            PolygonPart(
                outer_ring=[
                    PointUm(x_um=-4_000, y_um=-4_000),
                    PointUm(x_um=4_000, y_um=-4_000),
                    PointUm(x_um=4_000, y_um=-1_000),
                    PointUm(x_um=-1_000, y_um=-1_000),
                    PointUm(x_um=-1_000, y_um=4_000),
                    PointUm(x_um=-4_000, y_um=4_000),
                ]
            )
        ],
    )
    geometry = closed_entity_to_geometry(polygon)

    segments = hatch_segments(geometry, 300, 500, 100)

    assert segments
    for segment in segments:
        midpoint = Point(
            (segment.start.x_um + segment.end.x_um) / 2_000,
            (segment.start.y_um + segment.end.y_um) / 2_000,
        )
        assert geometry.covers(midpoint)

