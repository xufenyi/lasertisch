import hashlib
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from lasertisch.application import ApplicationApi
from lasertisch.domain.models import EllipseEntity, PointUm, ProjectDocument, ellipse_to_polygon, polygon_world_point
from lasertisch.geometry.conversion import closed_entity_to_geometry

ROOT = Path(__file__).resolve().parents[2]
SAMPLES = json.loads((ROOT/'fixtures/ellipse-sampling.json').read_text(encoding='utf-8'))


def payload():
    return json.loads((ROOT/'fixtures/ellipses-v2.lasertisch.json').read_text(encoding='utf-8'))


def digest(points):
    return hashlib.sha256(';'.join(f'{p.x_um},{p.y_um}' for p in points).encode('utf-8')).hexdigest()


@pytest.mark.parametrize('sample', SAMPLES, ids=lambda sample: str(sample['sides']))
def test_local_and_world_sampling_matches_shared_contract(sample):
    data = {key: value for key,value in sample.items() if not key.endswith('Sha256')}
    entity = EllipseEntity.model_validate({**payload()['entities'][0], **data, 'center':{'xUm':0,'yUm':0}})
    polygon = ellipse_to_polygon(entity)
    points = polygon.parts[0].outer_ring
    assert digest(points) == sample['localSha256']
    assert digest([polygon_world_point(polygon,p) for p in points]) == sample['worldSha256']
    assert not closed_entity_to_geometry(entity).is_empty


def test_ellipse_project_round_trip_and_conversion_preserve_geometry():
    document = ProjectDocument.model_validate(payload())
    assert ProjectDocument.model_validate_json(document.model_dump_json(by_alias=True)) == document
    for entity in document.entities:
        polygon = ellipse_to_polygon(entity)
        assert closed_entity_to_geometry(entity).equals_exact(closed_entity_to_geometry(polygon),0)
        assert len(polygon.parts[0].outer_ring) == entity.sides


@pytest.mark.parametrize('sides',[2,1025,3.5,True,'64'])
def test_invalid_side_counts_are_rejected(sides):
    data = payload()
    data['entities'][0]['sides'] = sides
    with pytest.raises(ValidationError):
        ProjectDocument.model_validate(data)


def test_tiny_outlines_and_outside_placement_are_rejected():
    data = payload()
    data['entities'][0].update(widthUm=1,heightUm=1)
    with pytest.raises(ValidationError):
        ProjectDocument.model_validate(data)
    data = payload()
    data['entities'][0]['center']['xUm'] = 95_000
    with pytest.raises(ValidationError,match='outside'):
        ProjectDocument.model_validate(data)
    data = payload(); data['schemaVersion']=1
    with pytest.raises(ValidationError,match='version 2'):
        ProjectDocument.model_validate(data)


def test_work_area_uses_actual_rotated_polygon_not_its_generating_rectangle():
    data=payload()
    data['entities'][0].update(widthUm=180_000,heightUm=180_000,rotationTenthsDeg=450,sides=64,center={'xUm':0,'yUm':0})
    assert ProjectDocument.model_validate(data).entities[0].width_um == 180_000


def test_ellipse_project_plans_and_exports_both_formats():
    data=payload(); api=ApplicationApi()
    response=api.plan_toolpaths({'apiVersion':1,'requestId':data['documentId'],'documentRevision':3,'document':data})
    assert response['ok'], response
    assert [task['sourceEntityIds'][0] for task in response['plan']['tasks']] == data['processingOrder']
    for format in ('csv','dbd'):
        result=api.export_device_program({'apiVersion':1,'requestId':data['documentId'],'documentRevision':3,'format':format,'plan':response['plan']})
        assert result['ok'],result
        assert result['contentBase64']
