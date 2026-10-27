from copy import deepcopy
import json
from pathlib import Path

import pytest
from pydantic import ValidationError
from shapely.geometry import LineString

from lasertisch.application import ApplicationApi
from lasertisch.domain.models import PointUm, PolygonEntity, ProjectDocument, polygon_world_point
from lasertisch.geometry.conversion import closed_entity_to_geometry


ROOT = Path(__file__).resolve().parents[2]


def payload():
    return json.loads((ROOT / 'fixtures/polygons-v2.lasertisch.json').read_text(encoding='utf-8'))


def test_v2_round_trip_retains_local_vertices_and_placement():
    document = ProjectDocument.model_validate(payload())
    assert document.schema_version == 2
    assert ProjectDocument.model_validate_json(document.model_dump_json(by_alias=True)) == document
    polygon = document.entities[2]
    assert isinstance(polygon, PolygonEntity)
    assert closed_entity_to_geometry(polygon).area == pytest.approx(1472, abs=.1)
    assert polygon_world_point(polygon.model_copy(update={'position': PointUm(x_um=10_000, y_um=-5_000), 'rotation_tenths_deg':900}), PointUm(x_um=2000, y_um=3000)) == PointUm(x_um=13_000, y_um=-7_000)


def test_v1_world_polygon_migrates_without_changing_vertices_or_input():
    legacy = payload()
    legacy['schemaVersion'] = 1
    for entity in legacy['entities']:
        del entity['position']
        del entity['rotationTenthsDeg']
    original = deepcopy(legacy)
    document = ProjectDocument.model_validate(legacy)
    assert document.schema_version == 2
    polygon = document.entities[0]
    assert polygon.rotation_tenths_deg == 0
    assert polygon_world_point(polygon, polygon.parts[0].outer_ring[0]).x_um == legacy['entities'][0]['parts'][0]['outerRing'][0]['xUm']
    assert legacy == original


@pytest.mark.parametrize('version', [True, 3, 1.0, '2'])
def test_invalid_versions_are_rejected(version):
    data = payload()
    data['schemaVersion'] = version
    with pytest.raises(ValidationError):
        ProjectDocument.model_validate(data)


def test_invalid_topology_and_world_placement_are_rejected_at_document_boundary():
    data = payload()
    data['entities'][2]['parts'][0]['holes'][0][0]['xUm'] = 90_000
    with pytest.raises(ValidationError, match='geometry.invalid'):
        ProjectDocument.model_validate(data)
    data = payload()
    data['entities'][0]['position']['xUm'] = 95_000
    with pytest.raises(ValidationError, match='outside'):
        ProjectDocument.model_validate(data)


def test_rotated_micron_grid_ties_match_frontend_rounding():
    polygon = ProjectDocument.model_validate(payload()).entities[0]
    polygon = polygon.model_copy(update={'position':PointUm(x_um=10_000,y_um=-5_000), 'rotation_tenths_deg':600})
    assert polygon_world_point(polygon, PointUm(x_um=1, y_um=0)) == PointUm(x_um=10_001, y_um=-5_001)


def test_document_rejects_vertices_collapsing_after_rotation():
    data = payload()
    data['entities'][0]['rotationTenthsDeg'] = 300
    data['entities'][0]['parts'] = [{'outerRing':[{'xUm':0,'yUm':0},{'xUm':1,'yUm':0},{'xUm':1,'yUm':1},{'xUm':0,'yUm':1}], 'holes':[]}]
    with pytest.raises(ValidationError, match='geometry.invalid'):
        ProjectDocument.model_validate(data)


def test_polygon_project_plans_and_exports_both_formats_without_marking_holes():
    api = ApplicationApi()
    data = payload()
    response = api.plan_toolpaths({'apiVersion':1, 'requestId':data['documentId'], 'documentRevision':7, 'document':data})
    assert response['ok'], response
    document = ProjectDocument.model_validate(data)
    assert [task['sourceEntityIds'][0] for task in response['plan']['tasks']] == data['processingOrder']
    for entity, task in zip(document.entities, response['plan']['tasks'], strict=True):
        geometry = closed_entity_to_geometry(entity)
        for segment in task['segments']:
            if segment['kind'] != 'hatch':
                continue
            line = LineString([(segment[key]['xUm']/1000, segment[key]['yUm']/1000) for key in ('start','end')])
            # Micron-grid intersections can differ from the exact edge by <= 1 micron.
            assert geometry.buffer(.001).covers(line)
    for format in ('csv','dbd'):
        exported = api.export_device_program({'apiVersion':1,'requestId':data['documentId'], 'documentRevision':7,'format':format,'plan':response['plan']})
        assert exported['ok'], exported
        assert exported['contentBase64']
