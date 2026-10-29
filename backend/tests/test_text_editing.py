from copy import deepcopy
from uuid import UUID
import math

import pytest
from shapely.geometry import Polygon

from lasertisch.application import ApplicationApi
from lasertisch.domain.models import TextEntity, PointUm, ProjectDocument
from lasertisch.domain.text import TextParameters
from lasertisch.geometry.conversion import closed_entity_to_geometry
from lasertisch.text.outlines import generate_text_outline
from lasertisch.text.short_segments import merge_short_segments


def entity_from(snapshot):
    return TextEntity(id=UUID(int=601),name='Editable text',position=PointUm(x_um=-30000,y_um=0),
        text=snapshot.source,parts=snapshot.parts,engine_versions=snapshot.engine_versions)


def lengths(snapshot):
    return [math.hypot(a.x_um-b.x_um,a.y_um-b.y_um) for p in snapshot.parts for ring in [p.outer_ring,*p.holes]
            for a,b in zip(ring,ring[1:]+ring[:1])]


def test_short_edge_merge_preserves_holes_corners_and_closing_edge():
    # One redundant vertex on a straight side, including a short closing edge.
    source=Polygon([(0,0),(.01,0),(2,0),(2,2),(0,2),(0,.01)],holes=[[(.5,.5),(.5,1),(1,1),(1,.5)]])
    merged,limited=merge_short_segments(source,100,2)
    assert not limited and merged.equals(source)
    assert len(merged.exterior.coords)==5 and len(merged.interiors)==1
    # A tiny square cannot meet a large target without losing a corner or hole.
    tiny=Polygon([(0,0),(.01,0),(.01,.01),(0,.01)])
    protected,_=merge_short_segments(tiny,100,1)
    assert protected.equals(tiny) and len(protected.exterior.coords)==5


def test_merge_error_is_cumulative_not_per_vertex():
    points=[(x/1000, .01*math.sin(x/100)) for x in range(1001)]
    source=Polygon(points+[(1,-1),(0,-1)])
    result,_=merge_short_segments(source,50,2)
    assert result.is_valid and source.boundary.hausdorff_distance(result.boundary)<=.00200001
    assert len(result.exterior.coords)<len(source.exterior.coords)


def test_processing_budget_keeps_unprocessed_edges_valid():
    source=Polygon([(x/500,0) for x in range(5001)]+[(10,1),(0,1)])
    merged,limited=merge_short_segments(source,100,1)
    assert limited and merged.is_valid and merged.equals(source)
    assert len(merged.exterior.coords)<len(source.exterior.coords)


def test_text_target_retains_details_and_reports_unmet_edges():
    reference,_=generate_text_outline(TextParameters(content='Üé ß',font_size_um=16000,curve_tolerance_um=1))
    merged,warnings=generate_text_outline(TextParameters(content='Üé ß',font_size_um=16000,curve_tolerance_um=20,short_segment_target_um=200))
    g1=closed_entity_to_geometry(entity_from(reference));g2=closed_entity_to_geometry(entity_from(merged))
    assert g1.boundary.hausdorff_distance(g2.boundary)<.023
    assert sum(len(p.holes) for p in reference.parts)==sum(len(p.holes) for p in merged.parts)
    assert len(merged.parts)==len(reference.parts)
    assert len(lengths(merged))<len(lengths(reference))
    count=sum(x<200 for x in lengths(merged))
    assert count>0
    assert next(w for w in warnings if w.code=='text.short_segments_remain').parameters['count']==count
    assert merged.source.short_segment_target_um==200
    baseline,_=generate_text_outline(TextParameters(content='Üé ß',font_size_um=16000,curve_tolerance_um=20))
    assert len(lengths(merged))<=len(lengths(baseline))


@pytest.mark.parametrize('target',[-1,190001,1.5,True])
def test_invalid_targets_are_rejected(target):
    with pytest.raises(ValueError):TextParameters(content='A',short_segment_target_um=target)


def test_text_projects_load_without_fonts_plan_and_boolean(monkeypatch):
    snapshot,_=generate_text_outline(TextParameters(content='B8',short_segment_target_um=100))
    text=entity_from(snapshot)
    document=ProjectDocument(document_id=UUID(int=1),project_name='Text',entities=[text],processing_order=[text.id])
    from lasertisch.text.fonts import FONT_REPOSITORY
    monkeypatch.setattr(FONT_REPOSITORY,'resolve',lambda *_:(_ for _ in ()).throw(AssertionError('font lookup')))
    saved=document.model_dump(mode='json',by_alias=True)
    restored=ProjectDocument.model_validate(saved)
    assert isinstance(restored.entities[0],TextEntity) and restored.entities[0].text.content=='B8'
    api=ApplicationApi();request=dict(apiVersion=1,requestId=str(UUID(int=2)),documentRevision=1,document=saved)
    assert api.plan_toolpaths(request)['ok']
    second=deepcopy(text);second.id=UUID(int=602);second.position.x_um+=2000
    document.entities.append(second);document.processing_order.append(second.id)
    request['document']=document.model_dump(mode='json',by_alias=True)
    result=api.boolean_geometry(dict(**request,operation='difference',operandAId=str(text.id),operandBId=str(second.id)))
    assert result['ok'] and result['result']['kind']=='polygon'
    saved['entities'][0]['parts'][0]['outerRing'][1]=saved['entities'][0]['parts'][0]['outerRing'][0]
    with pytest.raises(ValueError):ProjectDocument.model_validate(saved)
