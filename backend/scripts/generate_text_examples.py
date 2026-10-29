"""Generate the stage-5 polygon gallery and its portable text snapshots."""
from __future__ import annotations
import json
from pathlib import Path
import sys
from uuid import UUID

BACKEND_SRC = Path(__file__).resolve().parents[1]/"src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0,str(BACKEND_SRC))

from lasertisch.domain.models import PointUm, ProcessMode, ProcessSpec, ProjectDocument  # noqa: E402
from lasertisch.domain.text import TextParameters  # noqa: E402
from lasertisch.text.fonts import FONT_REPOSITORY  # noqa: E402
from lasertisch.text.outlines import generate_text_outline, outline_to_polygon  # noqa: E402


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    entities, snapshots = [], []
    for index,(content,x,y,size) in enumerate([
        ("AB 8",-80,65,16),("中文 回",-80,25,14),("한글",-80,-15,14),("Üé ß",-80,-55,16),
        ("AV fi",10,65,16),("B8",10,25,25),("2026",10,-15,18),("口回",10,-55,18),
    ],600):
        snapshot,warnings = generate_text_outline(TextParameters(content=content,font_size_um=size*1000))
        polygon = outline_to_polygon(snapshot,entity_id=UUID(int=index),name=f"文字 · {content}",
            position=PointUm(x_um=x*1000,y_um=y*1000),
            process=ProcessSpec(mode=ProcessMode.FILL_THEN_CONTOUR,hatch_spacing_um=200))
        entities.append(polygon)
        snapshots.append({"entityId":str(polygon.id),"snapshot":snapshot.model_dump(mode="json",by_alias=True),
                          "warnings":[warning.model_dump(mode="json",by_alias=True) for warning in warnings]})
    document = ProjectDocument(document_id=UUID(int=599),project_name="阶段 5：文字轮廓验收",entities=entities,
        processing_order=[entity.id for entity in entities])
    (root/"fixtures/text-outlines-v2.lasertisch.json").write_text(document.model_dump_json(by_alias=True,indent=2)+"\n",encoding="utf-8",newline="\n")
    (root/"fixtures/text-outline-snapshots-v1.json").write_text(json.dumps(snapshots,ensure_ascii=False,indent=2)+"\n",encoding="utf-8",newline="\n")
    font = FONT_REPOSITORY.default_record().descriptor
    catalog=dict(apiVersion=1,requestId=str(UUID(int=598)),ok=True,defaultFontId=font.id,
                 fonts=[font.model_dump(mode="json",by_alias=True)],errors=[],warnings=[])
    (root/"fixtures/default-font-catalog-v1.json").write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+"\n",encoding="utf-8",newline="\n")
    print("Generated text polygon gallery and snapshots")
    return 0


if __name__=="__main__":
    raise SystemExit(main())
