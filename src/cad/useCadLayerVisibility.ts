import { useState } from 'react';
import type { CadScene } from './prepareCadScene';

type Isolation = { layer: number; previous: Set<number> | null };

const NONE_HIDDEN: ReadonlySet<number> = new Set();

export function useCadLayerVisibility(scene: CadScene | null) {
  const [override, setOverride] = useState<Set<number> | null>(null);
  const [isolation, setIsolation] = useState<Isolation | null>(null);
  const layerCount = scene?.drawing.layers.length ?? 0;

  const hiddenLayers = override ?? NONE_HIDDEN;
  const extraHidden = override ? [...override] : [];

  return {
    hiddenLayers,
    isolatedLayer: isolation?.layer ?? null,
    extraHidden,
    setLayers: (hidden: Set<number>) => {
      setOverride(hidden);
      setIsolation(null);
    },
    toggleHidden: (layer: number) => {
      const next = new Set(hiddenLayers);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      setOverride(next);
      setIsolation(null);
    },
    toggleIsolate: (layer: number) => {
      if (isolation?.layer === layer) {
        setOverride(isolation.previous);
        setIsolation(null);
        return;
      }
      setIsolation({ layer, previous: isolation ? isolation.previous : override });
      setOverride(
        new Set(Array.from({ length: layerCount }, (_, i) => i).filter((i) => i !== layer)),
      );
    },
    reset: () => {
      setOverride(null);
      setIsolation(null);
    },
  };
}
