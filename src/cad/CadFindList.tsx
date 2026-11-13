import { useMemo, useRef, useState } from 'react';
import { layerLabel } from './CadLayersList';
import styles from './cadFloorPlan.module.css';
import { useViewerTranslate } from './platform';
import type { CadDrawing } from './types';

const MAX_ROWS = 200;
const MAX_LAYER_CHIPS = 12;
const BROWSABLE =
  /\p{L}{2,}|[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u;

export type CadFindTarget = { x: number; y: number; size: number; textIndex: number };

type Props = { drawing: CadDrawing; english: boolean; onPick: (target: CadFindTarget) => void };

type Label = {
  key: string;
  original: string;
  en: string | undefined;
  layer: number;
  indices: number[];
  browsable: boolean;
  haystack: string;
};

const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const oneLine = (value: string) => value.replace(/\s+/g, ' ').trim();

function groupLabels(drawing: CadDrawing, skip: ReadonlySet<number>): Label[] {
  const byKey = new Map<string, Label>();
  drawing.texts.forEach((text, index) => {
    if (skip.has(index)) return;
    const key = `${text.l}\u0000${text.s}`;
    const label = byKey.get(key);
    if (label) {
      label.indices.push(index);
      return;
    }
    byKey.set(key, {
      key,
      original: oneLine(text.s),
      en: text.en ? oneLine(text.en) : undefined,
      layer: text.l,
      indices: [index],
      browsable: BROWSABLE.test(text.s),
      haystack: fold(`${text.s}\n${text.en ?? ''}`),
    });
  });
  return [...byKey.values()].sort((a, b) => a.original.localeCompare(b.original));
}

function ResultRow(props: { title: string; detail?: string | null; onClick: () => void }) {
  return (
    <button type="button" className={styles.insetRow} onClick={props.onClick}>
      <span>{props.title}</span>
      {props.detail ? <span className={styles.insetDetail}>{props.detail}</span> : null}
    </button>
  );
}

function ChipRow(props: {
  chips: Array<[key: string, label: string, count: number]>;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  if (props.chips.length < 2) return null;
  return (
    <div className={styles.chips}>
      {props.chips.map(([key, label, count]) => (
        <button
          key={key}
          type="button"
          className={styles.chip}
          data-on={props.value === key}
          aria-pressed={props.value === key}
          onClick={() => props.onChange(props.value === key ? null : key)}
        >
          {label} · {count}
        </button>
      ))}
    </div>
  );
}

export function CadFindList({ drawing, english, onPick }: Props) {
  const t = useViewerTranslate();
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState<string | null>(null);
  const [layer, setLayer] = useState<string | null>(null);
  const occurrence = useRef(new Map<string, number>());
  const needle = fold(query.trim());

  const roomTexts = useMemo(() => new Set(drawing.rooms.map((room) => room.text)), [drawing.rooms]);
  const labels = useMemo(() => groupLabels(drawing, roomTexts), [drawing, roomTexts]);
  const departments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const room of drawing.rooms)
      counts.set(room.department, (counts.get(room.department) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [drawing.rooms]);
  const layerChips = useMemo(() => {
    const counts = new Map<number, number>();
    for (const label of labels)
      if (label.browsable) counts.set(label.layer, (counts.get(label.layer) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_LAYER_CHIPS)
      .map(([index, count]): [string, string, number] => [
        String(index),
        layerLabel(drawing.layers[index], english),
        count,
      ]);
  }, [labels, drawing.layers, english]);

  const rooms = drawing.rooms.filter(
    (room) =>
      (!department || room.department === department) &&
      (!needle || fold(`${room.id} ${room.name ?? ''}`).includes(needle)),
  );
  const matches = labels.filter(
    (label) =>
      (needle ? label.haystack.includes(needle) : label.browsable) &&
      (layer == null || String(label.layer) === layer),
  );

  const pickText = (index: number) => {
    const text = drawing.texts[index];
    if (text) onPick({ x: text.x, y: text.y, size: text.h * 12, textIndex: index });
  };
  const pickLabel = (label: Label) => {
    const next = ((occurrence.current.get(label.key) ?? -1) + 1) % label.indices.length;
    occurrence.current.set(label.key, next);
    pickText(label.indices[next] as number);
  };

  if (drawing.texts.length === 0) {
    return <p className={styles.note}>{t('viewer3d.cadFloorPlan.noText', 'This drawing has no text labels to search.')}</p>;
  }

  return (
    <div>
      <input
        className={styles.search}
        type="search"
        placeholder={t('viewer3d.cadFloorPlan.searchPlaceholder', 'Search rooms, labels or any text')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {drawing.rooms.length > 0 ? (
        <section className={styles.panelSection}>
          <ChipRow
            chips={departments.map(([code, count]) => [code, code, count])}
            value={department}
            onChange={setDepartment}
          />
          <p className={styles.panelCaption}>
            {t('viewer3d.cadFloorPlan.roomCount', 'Rooms')} ({rooms.length})
          </p>
          <div className={styles.insetGroup}>
            {rooms.map((room) => (
              <ResultRow
                key={room.id}
                title={`${room.name ?? '—'} · ${room.id}`}
                detail={[room.size, room.area_m2 != null ? `${room.area_m2} m²` : null].filter(Boolean).join(' · ')}
                onClick={() => pickText(room.text)}
              />
            ))}
          </div>
        </section>
      ) : null}
      <section className={styles.panelSection}>
        <ChipRow chips={layerChips} value={layer} onChange={setLayer} />
        <p className={styles.panelCaption}>
          {t('viewer3d.cadFloorPlan.labelCount', 'Labels')} ({matches.length})
        </p>
        <div className={styles.insetGroup}>
          {matches.slice(0, MAX_ROWS).map((label) => {
            const shown = english && label.en ? label.en : label.original;
            const other = english ? (label.en ? label.original : null) : (label.en ?? null);
            const count = label.indices.length > 1 ? `×${label.indices.length}` : null;
            return (
              <ResultRow
                key={label.key}
                title={shown}
                detail={[other, count].filter(Boolean).join(' · ')}
                onClick={() => pickLabel(label)}
              />
            );
          })}
        </div>
        {matches.length > MAX_ROWS ? (
          <p className={styles.note}>
            {t('viewer3d.cadFloorPlan.moreLabels', 'Showing {shown} of {total}. Type to narrow.', {
              shown: MAX_ROWS,
              total: matches.length,
            })}
          </p>
        ) : null}
      </section>
    </div>
  );
}
