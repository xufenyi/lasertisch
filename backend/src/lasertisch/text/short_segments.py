"""Conservative short-edge merging with a cumulative chord error budget."""
from collections import deque
import math

from shapely.geometry import MultiPolygon, Polygon


def _distance(p, a, b):
    dx,dy=b[0]-a[0],b[1]-a[1]
    length=dx*dx+dy*dy
    t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)) if length else 0
    return math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)


def merge_short_segments(geometry, target_um, tolerance_um):
    """Keep every original ring, and bound each replacement against its original chain.

    Both directions of the boundary displacement are bounded: the continuous old
    chain lies inside the chord capsule and its projection covers the chord.
    Work is bounded; protected or unprocessed edges remain in the output.
    """
    polygons=[geometry] if isinstance(geometry,Polygon) else list(geometry.geoms)
    groups=[]; originals=[]
    for polygon in polygons:
        group=[]
        for ring in [polygon.exterior,*polygon.interiors]:
            group.append(len(originals)); originals.append(list(ring.coords)[:-1])
        groups.append(group)
    current=[list(range(len(ring))) for ring in originals]
    target=target_um/1000; tolerance=tolerance_um/1000

    def build():
        rings=[[originals[k][index] for index in indices] for k,indices in enumerate(current)]
        parts=[Polygon(rings[group[0]],[rings[index] for index in group[1:]]) for group in groups]
        return parts[0] if len(parts)==1 else MultiPolygon(parts)

    def valid(candidate):
        if candidate.is_empty or not candidate.is_valid:return False
        parts=[candidate] if isinstance(candidate,Polygon) else candidate.geoms
        for part in parts:
            rings=[part.exterior,*part.interiors]
            if any(not ring.is_simple for ring in rings):return False
            if any(ring.intersects(other) for i,ring in enumerate(rings) for other in rings[i+1:]):return False
        return True

    queue=deque((k,index) for k,ring in enumerate(originals) for index in range(len(ring)))
    # Bound whole-outline rebuild work as well as the number of proposals.
    attempts=0; limit=min(10000,max(20,2_000_000//max(1,sum(map(len,originals)))))
    while queue and attempts<limit:
        k,index=queue.popleft();indices=current[k]
        if len(indices)<=3 or index not in indices:continue
        offset=indices.index(index); previous=indices[offset-1]; following=indices[(offset+1)%len(indices)]
        source=originals[k]; a,p,b=source[previous],source[index],source[following]
        if min(math.dist(a,p),math.dist(p,b))>=target:continue
        attempts+=1
        # Always compare to the original chain, not only the last removed point.
        cursor=(previous+1)%len(source); acceptable=True
        while cursor!=following:
            if _distance(source[cursor],a,b)>tolerance:
                acceptable=False;break
            cursor=(cursor+1)%len(source)
        if not acceptable:continue
        current[k]=indices[:offset]+indices[offset+1:]
        candidate=build()
        # Preserve the orientation of the affected ring, in addition to topology.
        old_area=sum(source[i][0]*source[j][1]-source[j][0]*source[i][1] for i,j in zip(indices,indices[1:]+indices[:1]))
        updated=current[k]
        new_area=sum(source[i][0]*source[j][1]-source[j][0]*source[i][1] for i,j in zip(updated,updated[1:]+updated[:1]))
        if old_area*new_area<=0 or not valid(candidate):
            current[k]=indices;continue
        queue.extend([(k,previous),(k,following)])
    return build(),bool(queue)
