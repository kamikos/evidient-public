import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";
import type { SimulationLinkDatum, SimulationNodeDatum } from "d3-force";
import { GRID } from "@/ui/theme";

export interface LayoutNode extends SimulationNodeDatum {
  id: string;
}

export interface Placed {
  id: string;
  x: number;
  y: number;
}

/**
 * Deterministic force layout that registers every node to the plate's modular grid.
 * Same ids + links + size always produce the same plate (important for a recorded demo).
 */
export function layoutPlate(
  ids: string[],
  links: { a: string; b: string }[],
  width: number,
  height: number,
  pad = Math.min(GRID * 3, Math.max(GRID, width * 0.07)),
): Placed[] {
  if (ids.length === 0 || width <= 0 || height <= 0) return [];
  const sorted = [...ids].sort();
  const cx = width / 2;
  const cy = height / 2;
  const r0 = Math.min(width, height) / 3;

  if (sorted.length === 1) return [{ id: sorted[0], x: snap(cx * 0.8), y: snap(cy) }];

  const nodes: LayoutNode[] = sorted.map((id, i) => {
    const t = (i / sorted.length) * Math.PI * 2 - Math.PI / 2;
    return { id, x: cx + Math.cos(t) * r0, y: cy + Math.sin(t) * r0 };
  });
  const linkData: SimulationLinkDatum<LayoutNode>[] = links
    .filter((l) => sorted.includes(l.a) && sorted.includes(l.b))
    .map((l) => ({ source: l.a, target: l.b }));

  const span = Math.min(width, height);
  const sim = forceSimulation(nodes)
    .force("charge", forceManyBody().strength(-span * 2.2))
    .force("link", forceLink<LayoutNode, SimulationLinkDatum<LayoutNode>>(linkData).id((d) => d.id).distance(span * 0.34).strength(0.5))
    .force("collide", forceCollide(GRID * 3.2))
    .force("x", forceX(cx).strength(0.06))
    .force("y", forceY(cy).strength(0.09))
    .force("center", forceCenter(cx, cy))
    .stop();
  for (let i = 0; i < 360; i++) sim.tick();

  // Fit into the plate with padding (labels sit to the right of marks, so reserve more on the right).
  const xs = nodes.map((n) => n.x ?? cx);
  const ys = nodes.map((n) => n.y ?? cy);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  const labelRoom = Math.min(GRID * 7, width * 0.28);
  const availW = Math.max(1, width - pad * 2 - labelRoom);
  const availH = Math.max(1, height - pad * 2);
  const s = Math.min(availW / Math.max(1, maxX - minX), availH / Math.max(1, maxY - minY), 1.6);
  const offX = pad + (availW - (maxX - minX) * s) / 2;
  const offY = pad + (availH - (maxY - minY) * s) / 2;

  const taken = new Set<string>();
  return nodes.map((n) => {
    let x = snap(offX + ((n.x ?? cx) - minX) * s);
    let y = snap(offY + ((n.y ?? cy) - minY) * s);
    // Resolve collisions on the grid by stepping down a row, then right.
    let guard = 0;
    while (taken.has(`${x},${y}`) && guard++ < 20) {
      y += GRID * 2;
      if (y > height - pad) {
        y = snap(pad);
        x += GRID * 2;
      }
    }
    taken.add(`${x},${y}`);
    return { id: n.id, x, y };
  });
}

function snap(v: number) {
  return Math.round(v / GRID) * GRID;
}
