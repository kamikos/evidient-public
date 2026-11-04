import { edges } from '../data/edges';
import { main, pairs, save, type Pair } from "./batch-io";
export function slices() {
  const buckets: Pair[][] = Array.from({ length: 5 }, () => []);
  // Final pairs already place the alcohol tier first. Round-robin keeps it first in each slice.
  pairs().forEach((p, i) => buckets[i % 5].push(p));
  buckets.forEach((bucket, i) => save(`data/batch/slices/slice-${i}.json`, bucket));
  save('data/batch/slices/eu-reviewed.json', edges.map(e => ({ pair: e.pair, a: e.a, b: e.b })));
}
if (main("batch-slices.ts")) slices();
