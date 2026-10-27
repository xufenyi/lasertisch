from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys
from uuid import UUID

import pytest
from shapely.geometry import LineString

from lasertisch.application import ApplicationApi
from lasertisch.domain.bridge import BooleanOperation, BooleanResponse
from lasertisch.domain.models import PointUm, ProjectDocument, RectangleEntity, ProcessSpec, PolygonEntity
from lasertisch.geometry.boolean import boolean_document
from lasertisch.geometry.conversion import closed_entity_to_geometry

ROOT = Path(__file__).resolve().parents[2]
A, B, DOC = UUID(int=2), UUID(int=3), UUID(int=1)


def rectangles(bx=10_000, by=0, aw=20_000, ah=20_000, bw=20_000, bh=20_000):
    a = RectangleEntity(id=A, name='形状 A', center=PointUm(x_um=0,y_um=0),width_um=aw,height_um=ah,
                        process=ProcessSpec(mark_speed_um_per_sec=123_000))
    b = RectangleEntity(id=B, name='形状 B', center=PointUm(x_um=bx,y_um=by),width_um=bw,height_um=bh,
                        process=ProcessSpec(mark_speed_um_per_sec=456_000))
    return ProjectDocument(document_id=DOC, project_name='布尔测试', entities=[a,b],processing_order=[B,A])


@pytest.mark.parametrize(('operation','area'),[(BooleanOperation.UNION,600),(BooleanOperation.INTERSECTION,200),(BooleanOperation.DIFFERENCE,200)])
def test_operations_preserve_parameters_and_do_not_mutate_document(operation,area):
    document=rectangles(); original=document.model_dump_json()
    result=boolean_document(document,operation,A,B)
    assert isinstance(result,PolygonEntity)
    assert closed_entity_to_geometry(result).area == pytest.approx(area)
    assert result.process == document.entities[0].process
    assert result.id not in (A,B)
    assert result.rotation_tenths_deg == 0
    assert document.model_dump_json() == original


def test_difference_is_ordered_and_inherits_the_first_operand():
    document=rectangles()
    ab=boolean_document(document,BooleanOperation.DIFFERENCE,A,B)
    ba=boolean_document(document,BooleanOperation.DIFFERENCE,B,A)
    assert closed_entity_to_geometry(ab).bounds == (-10,-10,0,10)
    assert closed_entity_to_geometry(ba).bounds == (10,-10,20,10)
    assert ba.process == document.entities[1].process


def test_containment_produces_a_hole_and_crossing_cut_produces_disconnected_parts():
    hole=boolean_document(rectangles(bx=0,aw=60_000,ah=40_000,bw=20_000,bh=10_000),BooleanOperation.DIFFERENCE,A,B)
    assert len(hole.parts)==1 and len(hole.parts[0].holes)==1
    assert closed_entity_to_geometry(hole).area == pytest.approx(2200)
    split=boolean_document(rectangles(bx=0,aw=60_000,ah=40_000,bw=10_000,bh=60_000),BooleanOperation.DIFFERENCE,A,B)
    assert len(split.parts)==2
    assert closed_entity_to_geometry(split).area == pytest.approx(2000)


@pytest.mark.parametrize(('bx','by'),[(40_000,0),(20_000,0),(20_000,20_000)])
def test_disjoint_and_line_or_point_contacts_have_no_area_intersection(bx,by):
    document=rectangles(bx=bx,by=by)
    assert boolean_document(document,BooleanOperation.INTERSECTION,A,B) is None
    union=boolean_document(document,BooleanOperation.UNION,A,B)
    assert closed_entity_to_geometry(union).area == pytest.approx(800)
    assert len(union.parts) == (1 if (bx,by)==(20_000,0) else 2)


def test_identical_shapes_and_full_subtraction():
    document=rectangles(bx=0)
    for operation in (BooleanOperation.UNION,BooleanOperation.INTERSECTION):
        assert closed_entity_to_geometry(boolean_document(document,operation,A,B)).area == pytest.approx(400)
    assert boolean_document(document,BooleanOperation.DIFFERENCE,A,B) is None


def fixture_document():
    return json.loads((ROOT/'fixtures/booleans-v2.lasertisch.json').read_text(encoding='utf-8'))


def request(document=None,operation='union',a=A,b=B):
    data = document.model_dump(mode='json',by_alias=True) if document else rectangles().model_dump(mode='json',by_alias=True)
    return dict(apiVersion=1,requestId=str(DOC),documentRevision=9,document=data,operation=operation,operandAId=str(a),operandBId=str(b))


@pytest.mark.parametrize(('change','code'),[
    ({'operandBId':str(A)},'boolean.distinct_operands_required'),
    ({'operandBId':str(UUID(int=99))},'boolean.operand_not_found'),
    ({'operation':'xor'},'contract.invalid_boolean_request'),
])
def test_invalid_requests_are_structured_failures(change,code):
    data=request(); data.update(change)
    response=ApplicationApi().boolean_geometry(data)
    assert not response['ok'] and response['result'] is None and not response['empty']
    assert response['errors'][0]['code']==code
    assert response['requestId']==str(DOC) and response['documentRevision']==9


@pytest.mark.parametrize('condition',['line','locked','hidden'])
def test_line_locked_and_hidden_operands_are_rejected(condition):
    data=request(); entity=data['document']['entities'][1]
    if condition=='line':
        data['document']['entities'][1]={key:value for key,value in entity.items() if key not in ('center','widthUm','heightUm','rotationTenthsDeg')}
        data['document']['entities'][1].update(kind='line',start={'xUm':0,'yUm':0},end={'xUm':1000,'yUm':0})
    elif condition=='locked': entity['locked']=True
    else: entity['visible']=False
    response=ApplicationApi().boolean_geometry(data)
    assert response['errors'][0]['code']==('boolean.closed_shapes_required' if condition=='line' else 'boolean.operands_unavailable')


def test_boolean_result_schema_rejects_inconsistent_empty_or_error_states():
    for data in [dict(ok=True,result=None,empty=False),dict(ok=False,result=None,empty=True,errors=[{'code':'boolean.failed'}])]:
        with pytest.raises(ValueError):
            BooleanResponse(request_id=DOC,document_revision=0,**data)


def test_rotated_ellipse_results_round_trip_and_export_without_marking_holes():
    document=ProjectDocument.model_validate(fixture_document()); api=ApplicationApi()
    for indexes, operation in [((2,3),'difference'),((4,5),'difference'),((6,7),'intersection')]:
        a,b=(document.entities[index].id for index in indexes)
        response=api.boolean_geometry(request(document,operation,a,b))
        assert response['ok'],response
        result=response['result']
        data=document.model_dump(mode='json',by_alias=True);data.update(entities=[result],processingOrder=[result['id']])
        round_trip=ProjectDocument.model_validate_json(json.dumps(data))
        polygon=round_trip.entities[0]; geometry=closed_entity_to_geometry(polygon)
        assert all(type(point.x_um) is int and type(point.y_um) is int for part in polygon.parts for ring in (part.outer_ring,*part.holes) for point in ring)
        plan=api.plan_toolpaths(dict(apiVersion=1,requestId=str(DOC),documentRevision=10,document=data))
        assert plan['ok'],plan
        for segment in plan['plan']['tasks'][0]['segments']:
            if segment['kind']!='hatch': continue
            line=LineString([(segment[key]['xUm']/1000,segment[key]['yUm']/1000) for key in ('start','end')])
            assert geometry.buffer(.001).covers(line)
        for format in ('csv','dbd'):
            exported=api.export_device_program(dict(apiVersion=1,requestId=str(DOC),documentRevision=10,format=format,plan=plan['plan']))
            assert exported['ok'],exported


def test_empty_response_and_utf8_stdio_bridge():
    empty=ApplicationApi().boolean_geometry(request(rectangles(bx=40_000),'intersection'))
    assert empty['ok'] and empty['empty'] and empty['result'] is None
    data=request(); original=deepcopy(data)
    completed=subprocess.run([sys.executable,str(ROOT/'backend/scripts/boolean_geometry_stdio.py')],
        input=json.dumps(data,ensure_ascii=False).encode('utf-8'),capture_output=True,check=True,timeout=30)
    response=json.loads(completed.stdout.decode('utf-8'))
    assert response['ok'] and response['documentRevision']==9
    assert data==original
