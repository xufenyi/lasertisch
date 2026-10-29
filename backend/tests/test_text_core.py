from copy import deepcopy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from uuid import UUID

import pytest
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTCollection, TTFont
from shapely.geometry import LineString

from lasertisch.application import ApplicationApi
from lasertisch.domain.models import PointUm, ProcessMode, ProcessSpec, ProjectDocument
from lasertisch.domain.text import TextOutlineSnapshot, TextParameters
from lasertisch.geometry.conversion import closed_entity_to_geometry
from lasertisch.text import fonts, outlines
from lasertisch.text.errors import TextGeometryError
from lasertisch.text.fonts import FontRepository
from lasertisch.text.outlines import FlattenPen, filled_contours, generate_text_outline, outline_to_polygon

ROOT=Path(__file__).resolve().parents[2]


@pytest.fixture(scope='module')
def basic():
    return generate_text_outline(TextParameters(content='AB 8'))[0]


def make_font(path, style='Regular', triangle=False, advance=700):
    builder=FontBuilder(1000,isTTF=True)
    order=['.notdef','A','space'];builder.setupGlyphOrder(order);builder.setupCharacterMap({65:'A',32:'space'})
    glyphs={}
    for name in order:
        pen=TTGlyphPen(None)
        if name!='space':
            pen.moveTo((0,0));pen.lineTo((600,0))
            if not triangle:pen.lineTo((600,700))
            pen.lineTo((0,700));pen.closePath()
        glyphs[name]=pen.glyph()
    builder.setupGlyf(glyphs)
    builder.setupHorizontalMetrics({name:(300 if name=='space' else advance,0) for name in order})
    builder.setupHorizontalHeader(ascent=800,descent=-200)
    builder.setupNameTable(dict(familyName='LaserTisch Test',styleName=style,fullName=f'LaserTisch Test {style}',psName=f'LaserTischTest-{style}',uniqueFontIdentifier=f'LaserTischTest-{style}'))
    builder.setupOS2(sTypoAscender=800,sTypoDescender=-200,usWinAscent=800,usWinDescent=200)
    builder.setupPost();builder.setupMaxp();builder.save(path)


def test_bundled_font_integrity_coverage_and_notices():
    assets=fonts.FONT_ASSETS
    manifest=json.loads((assets/'manifest.json').read_text(encoding='utf-8'))
    assert hashlib.sha256((assets/manifest['filename']).read_bytes()).hexdigest()==manifest['sha256']
    assert 'SIL OPEN FONT LICENSE Version 1.1' in (assets/'OFL.txt').read_text(encoding='utf-8')
    assert (assets/'COPYRIGHT.txt').read_text(encoding='utf-8').strip()==manifest['copyright']
    with TTFont(assets/manifest['filename']) as font:
        assert all(ord(char) in font.getBestCmap() for char in '中文回한글ÜéßAB8')
    default, descriptors, skipped=FontRepository().list_fonts(False)
    assert skipped==0 and len(descriptors)==1 and descriptors[0].id==default
    assert descriptors[0].bundled and descriptors[0].family=='Noto Sans CJK SC'
    assert 'path' not in descriptors[0].model_dump_json().lower()


def test_font_catalog_handles_collections_deduplication_and_corrupt_files(tmp_path,monkeypatch):
    regular=tmp_path/'regular.ttf';bold=tmp_path/'bold.ttf';collection=tmp_path/'fonts.ttc';bad=tmp_path/'bad.ttf'
    make_font(regular);make_font(bold,'Bold',triangle=True);bad.write_bytes(b'not a font')
    ttc=TTCollection();ttc.fonts=[TTFont(regular),TTFont(bold)];ttc.save(collection);ttc.close()
    monkeypatch.setattr(fonts,'installed_font_paths',lambda:[fonts.FONT_ASSETS/'NotoSansCJKsc-Regular.otf',collection,bad])
    repository=FontRepository();default,descriptors,skipped=repository.list_fonts()
    assert len(descriptors)==3 and skipped==1
    faces=sorted((font for font in descriptors if not font.bundled),key=lambda font:font.face_index)
    assert [font.face_index for font in faces]==[0,1]
    assert faces[0].fingerprint==faces[1].fingerprint and faces[0].id!=faces[1].id
    for face,area in zip(faces,[42,21]):
        snapshot,_=generate_text_outline(TextParameters(content='A',font_id=face.id),repository)
        assert closed_entity_to_geometry(outline_to_polygon(snapshot)).area==pytest.approx(area)


def test_missing_or_changed_fonts_never_silently_fall_back(tmp_path,monkeypatch):
    path=tmp_path/'test.ttf';make_font(path)
    monkeypatch.setattr(fonts,'installed_font_paths',lambda:[path])
    repository=FontRepository();_,descriptors,_=repository.list_fonts()
    descriptor=next(font for font in descriptors if not font.bundled)
    path.write_bytes(path.read_bytes()+b'changed')
    with pytest.raises(TextGeometryError,match='font.changed'):
        generate_text_outline(TextParameters(content='A',font_id=descriptor.id),repository)
    with pytest.raises(TextGeometryError,match='font.unavailable'):
        repository.resolve('0'*64+':0')
    monkeypatch.setattr(fonts,'FONT_ASSETS',tmp_path/'missing')
    with pytest.raises(TextGeometryError,match='font.default_unavailable'):
        FontRepository().default_record()


def test_basic_outline_preserves_counters_and_natural_spaces(basic):
    assert len(basic.parts)==3 and sum(len(part.holes) for part in basic.parts)==5
    assert basic.glyph_count==4 and basic.advance_um>0
    compact,_=generate_text_outline(TextParameters(content='AB8'))
    assert basic.advance_um>compact.advance_um
    assert not generate_text_outline(TextParameters(content='中文回 한글 Üé'))[1]


@pytest.mark.parametrize('content',['',' ','A\nB','A\tB','A\rB','A\u2028B','A\u2029B','A\x00B','\ud800'])
def test_single_line_input_rejects_blank_controls_and_line_breaks(content):
    with pytest.raises(ValueError):TextParameters(content=content)


def test_missing_glyphs_and_too_small_outlines_are_explicit():
    with pytest.raises(TextGeometryError) as missing:
        generate_text_outline(TextParameters(content='A\U0010ffff'))
    assert missing.value.code=='text.missing_glyphs' and missing.value.parameters['characters']=='U+10FFFF'
    with pytest.raises(TextGeometryError,match='text.too_small'):
        generate_text_outline(TextParameters(content='i',font_size_um=1))


def test_nonzero_winding_and_overlap_union_preserve_filled_regions():
    outer=[(0,0),(10000,0),(10000,10000),(0,10000)]
    inner=[(2000,2000),(8000,2000),(8000,8000),(2000,8000)]
    assert filled_contours([outer,inner]).area==pytest.approx(100)
    holed=filled_contours([outer,list(reversed(inner))])
    assert holed.area==pytest.approx(64) and len(holed.interiors)==1


@pytest.mark.parametrize('cubic',[False,True])
def test_adaptive_subdivision_bounds_curve_deviation(cubic):
    pen=FlattenPen(None,1,1);pen.moveTo((0,0))
    if cubic:pen.curveTo((0,100),(100,100),(100,0))
    else:pen.qCurveTo((50,100),(100,0))
    pen.lineTo((0,0));pen.closePath()
    line=LineString(pen.contours[0]+pen.contours[0][:1])
    for i in range(101):
        t=i/100
        point=((300*t*t-200*t*t*t,300*t*(1-t)) if cubic else (100*t,200*t*(1-t)))
        from shapely.geometry import Point
        assert line.distance(Point(*point))<=1.00001


def test_tolerance_controls_vertices_and_resource_limit_is_bounded(monkeypatch):
    fine,_=generate_text_outline(TextParameters(content='B8',font_size_um=25000,curve_tolerance_um=1))
    coarse,_=generate_text_outline(TextParameters(content='B8',font_size_um=25000,curve_tolerance_um=20))
    count=lambda snapshot:sum(len(ring) for part in snapshot.parts for ring in (part.outer_ring,*part.holes))
    assert count(fine)>count(coarse)
    assert closed_entity_to_geometry(outline_to_polygon(fine)).hausdorff_distance(closed_entity_to_geometry(outline_to_polygon(coarse)))<.03
    monkeypatch.setattr(outlines,'MAX_TEXT_VERTICES',10)
    with pytest.raises(TextGeometryError,match='text.too_complex'):
        generate_text_outline(TextParameters(content='B8'))


def test_composites_and_overlapping_glyphs_use_font_advances(tmp_path,monkeypatch):
    path=tmp_path/'overlap.ttf';make_font(path,advance=400)
    monkeypatch.setattr(fonts,'installed_font_paths',lambda:[path])
    repository=FontRepository();_,descriptors,_=repository.list_fonts()
    descriptor=next(font for font in descriptors if not font.bundled)
    snapshot,_=generate_text_outline(TextParameters(content='AA',font_id=descriptor.id),repository)
    assert snapshot.advance_um==8000
    assert closed_entity_to_geometry(outline_to_polygon(snapshot)).area==pytest.approx(70)
    composed,_=generate_text_outline(TextParameters(content='A\u030A'))
    precomposed,_=generate_text_outline(TextParameters(content='Å'))
    assert composed.geometry_hash==precomposed.geometry_hash


def test_snapshots_round_trip_without_fonts_and_detect_tampering(basic,monkeypatch):
    monkeypatch.setattr(fonts.FONT_REPOSITORY,'resolve',lambda *_:(_ for _ in ()).throw(AssertionError('font lookup')))
    restored=TextOutlineSnapshot.model_validate_json(basic.model_dump_json(by_alias=True))
    assert restored==basic
    for kind in ['source','geometry','version']:
        data=json.loads(basic.model_dump_json(by_alias=True))
        if kind=='source':data['source']['content']='Changed'
        elif kind=='geometry':data['parts'][0]['outerRing'][0]['xUm']+=1
        else:data['generatorVersion']='unknown'
        with pytest.raises(ValueError):TextOutlineSnapshot.model_validate(data)
    polygon=outline_to_polygon(restored)
    polygon.parts[0].outer_ring[0].x_um+=1
    assert restored.parts[0].outer_ring[0]!=polygon.parts[0].outer_ring[0]


def test_text_polygons_plan_serpentine_fill_and_export_without_filling_holes(basic):
    polygon=outline_to_polygon(basic,position=PointUm(x_um=-30000,y_um=0),rotation_tenths_deg=250,
        process=ProcessSpec(mode=ProcessMode.FILL_THEN_CONTOUR,hatch_spacing_um=300))
    document=ProjectDocument(document_id=UUID(int=1),project_name='Text CAM',entities=[polygon],processing_order=[polygon.id])
    geometry=closed_entity_to_geometry(polygon);api=ApplicationApi()
    response=api.plan_toolpaths(dict(apiVersion=1,requestId=str(UUID(int=1)),documentRevision=1,document=document.model_dump(mode='json',by_alias=True)))
    assert response['ok'],response
    for segment in response['plan']['tasks'][0]['segments']:
        if segment['kind']!='hatch':continue
        line=LineString([(segment[key]['xUm']/1000,segment[key]['yUm']/1000) for key in ('start','end')])
        assert geometry.buffer(.001).covers(line)
    for format in ['csv','dbd']:
        assert api.export_device_program(dict(apiVersion=1,requestId=str(UUID(int=1)),documentRevision=1,format=format,plan=response['plan']))['ok']


def test_font_and_text_api_and_utf8_stdio():
    api=ApplicationApi();request_id=str(UUID(int=97))
    catalog=api.font_catalog(dict(apiVersion=1,requestId=request_id,includeSystem=False))
    assert catalog['ok'] and len(catalog['fonts'])==1 and catalog['defaultFontId']==catalog['fonts'][0]['id']
    request=dict(apiVersion=1,requestId=request_id,documentRevision=7,parameters=dict(content='中文回',fontSizeUm=10000))
    original=deepcopy(request);response=api.text_outline(request)
    assert response['ok'] and response['documentRevision']==7 and response['snapshot']['source']['content']=='中文回'
    request['parameters']['content']='A\nB';failure=api.text_outline(request)
    assert not failure['ok'] and failure['errors'][0]['code']=='contract.invalid_text_request'
    completed=subprocess.run([sys.executable,str(ROOT/'backend/scripts/text_stdio.py')],input=json.dumps(original,ensure_ascii=False).encode('utf-8'),capture_output=True,check=True,timeout=30)
    assert json.loads(completed.stdout.decode('utf-8'))['snapshot']['geometryHash']==response['snapshot']['geometryHash']


def test_skipped_fonts_are_silent_in_the_application_api(monkeypatch):
    default,descriptors,_=FontRepository().list_fonts(False)
    monkeypatch.setattr(fonts.FONT_REPOSITORY,'list_fonts',lambda *_:(default,descriptors,7))
    response=ApplicationApi().font_catalog(dict(apiVersion=1,requestId=str(UUID(int=98))))
    assert response['ok'] and response['fonts']
    assert response['warnings']==[] and response['errors']==[]
