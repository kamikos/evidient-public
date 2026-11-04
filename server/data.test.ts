import { describe, expect, it } from 'vitest';
import { substances, labelSetIds } from '../data/substances';
import { edges } from '../data/edges';
import support from '../data/seed-support.json';
import { sources } from './generated/sources';
import { getGraph, searchSubstances } from './catalog';

describe('curated dataset', () => {
  it('has 17 unique nodes and pinned non-alcohol labels', () => {
    expect(substances).toHaveLength(17);
    expect(new Set(substances.map(s => s.id)).size).toBe(17);
    for (const substance of substances.filter(s => s.kind !== 'alcohol')) {
      expect(substance.rxcui).toMatch(/^\d+$/);
      expect(labelSetIds[substance.id]).toMatch(/^[a-f0-9-]{36}$/);
    }
  });
  it('has canonical pairs, existing endpoints, and readable exact snapshots', async () => {
    expect(new Set(edges.map(e => e.pair)).size).toBe(edges.length);
    for (const edge of edges) {
      expect(substances.some(s => s.id === edge.a)).toBe(true);
      expect(substances.some(s => s.id === edge.b)).toBe(true);
      expect(edge.a < edge.b).toBe(true);
      expect(edge.pair).toBe([edge.a, edge.b].sort().join('__'));
      expect(edge.label).not.toMatch(/\bsafe\b/i);
      expect(edge.seedSources.length).toBeGreaterThan(0);
      for (const source of edge.seedSources) {
        const snapshot = sources[source.id];
        expect(snapshot?.id).toBe(source.id);
        expect(snapshot?.kind).toBe(source.kind);
        expect(snapshot?.text.length).toBeGreaterThan(20);
      }
      const proof = support.find(s => s.pair === edge.pair);
      expect(proof).toBeDefined();
      if (proof) {
        const snapshot = sources[proof.source.id];
        expect(snapshot?.text).toContain(proof.matchedText);
      }
    }
  });
  it('keeps the original EV order and searchable display brands', () => {
    expect(edges.slice(0, 16).map(edge => edge.pair)).toEqual([
      'acetaminophen__alcohol', 'alcohol__ibuprofen', 'alcohol__metronidazole', 'alcohol__sertraline',
      'alcohol__tramadol', 'alcohol__lorazepam', 'alcohol__zolpidem', 'alcohol__diphenhydramine',
      'alcohol__cetirizine', 'aspirin__ibuprofen', 'ibuprofen__warfarin', 'sertraline__warfarin',
      'sertraline__tramadol', 'lorazepam__tramadol', 'lorazepam__zolpidem', 'diphenhydramine__zolpidem',
    ]);
    for (const substance of substances) for (const brand of substance.brands ?? []) {
      expect(substance.aliases).toContain(brand.toLowerCase());
      expect(searchSubstances(brand).results.map(s => s.id)).toContain(substance.id);
    }
    expect(edges.some(edge => edge.pair === 'alcohol__amoxicillin')).toBe(false);
    expect(edges.some(edge => edge.pair === 'hydroxyzine__sertraline')).toBe(false);
  });
  it('searches names and aliases and returns the contract graph shape', () => {
    expect(searchSubstances('sert').results.map(s => s.id)).toEqual(['sertraline']);
    expect(searchSubstances('Zoloft').results.map(s => s.id)).toEqual(['sertraline']);
    const graph = getGraph(['alcohol', 'metronidazole', 'sertraline', 'unknown']);
    expect(graph.substances).toHaveLength(3);
    expect(graph.edges.map(e => e.pair)).toEqual(['alcohol__metronidazole', 'alcohol__sertraline']);
    expect(graph.edges.every(e => e.depth === null)).toBe(true);
  });
});
