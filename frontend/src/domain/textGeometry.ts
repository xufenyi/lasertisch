import type { PolygonShape } from './model';
import { polygonRings, polygonWorldParts } from './polygonGeometry';

export function shortEdgeStatistics(entity: PolygonShape, targetUm: number) {
  const edges=polygonRings(polygonWorldParts(entity)).flatMap(ring=>ring.map((a,i)=>({a,b:ring[(i+1)%ring.length]})));
  const lengths=edges.map(({a,b})=>Math.hypot(a.xUm-b.xUm,a.yUm-b.yUm));
  return {vertices:lengths.length,minimumUm:Math.min(...lengths),shortEdges:edges.filter((_,i)=>lengths[i]<targetUm)};
}
