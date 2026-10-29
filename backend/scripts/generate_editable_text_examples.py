"""Generate editable text and a simulated missing-font acceptance project."""
from pathlib import Path
import sys
from uuid import UUID

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from lasertisch.domain.models import TextEntity, ProjectDocument, PointUm, ProcessSpec, ProcessMode
from lasertisch.domain.text import TextParameters
from lasertisch.text.outlines import generate_text_outline


def main():
    root=Path(__file__).resolve().parents[2];entities=[]
    for index,(content,x,y,size,target,tolerance) in enumerate([
        ('AB 8',-75,60,16,0,5),('AB 8',-75,25,16,200,20),
        ('中文 回',-75,-15,14,100,5),('Üé ß',10,60,16,200,20),
        ('한글',10,25,14,100,5),('B8',10,-25,18,200,10),
    ],700):
        snapshot,_=generate_text_outline(TextParameters(content=content,font_size_um=size*1000,
            curve_tolerance_um=tolerance,short_segment_target_um=target))
        entities.append(TextEntity(id=UUID(int=index),name=f'文字 {index-699} · {content}',text=snapshot.source,
            parts=snapshot.parts,engine_versions=snapshot.engine_versions,position=PointUm(x_um=x*1000,y_um=y*1000),
            process=ProcessSpec(mode=ProcessMode.FILL_THEN_CONTOUR,hatch_spacing_um=200)))
    document=ProjectDocument(document_id=UUID(int=699),project_name='阶段 6：可编辑文字和短边',entities=entities,processing_order=[e.id for e in entities])
    (root/'fixtures/editable-text-v2.lasertisch.json').write_text(document.model_dump_json(by_alias=True,indent=2)+'\n',encoding='utf-8')
    missing=entities[0].model_copy(deep=True)
    # Test-only identity: represents an absent font without uninstalling anything.
    font=missing.text.font.model_dump(mode='json',by_alias=True)
    font.update(id='0'*64+':0',fingerprint='0'*64,family='Missing font example',bundled=False)
    from lasertisch.domain.text import FontReference
    missing.text.font=FontReference.model_validate(font)
    document=ProjectDocument(document_id=UUID(int=799),project_name='阶段 6：模拟字体缺失',entities=[missing],processing_order=[missing.id])
    (root/'fixtures/text-missing-font-v2.lasertisch.json').write_text(document.model_dump_json(by_alias=True,indent=2)+'\n',encoding='utf-8')
    print('Editable text and missing-font projects generated')


if __name__=='__main__':main()
