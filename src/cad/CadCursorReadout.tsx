import styles from './cadFloorPlan.module.css';
import { CAD_SNAP_LABELS } from './cadSnap';
import { formatCoordinate } from './cadUnits';
import type { CadCursor } from './useCadCanvas';

type Props = {
  cursor: CadCursor | null;
  metersPerUnit: number | null;
  units: string;
  measuring: boolean;
};

/** The cursor's X and Y in the drawing's coordinates, with the snap and angle lock while measuring. */
export function CadCursorReadout({ cursor, metersPerUnit, units, measuring }: Props) {
  const unit = metersPerUnit ? '' : ` ${units}`;
  const value = (n: number | undefined) => (n === undefined ? '–' : `${formatCoordinate(n, metersPerUnit)}${unit}`);
  // The chip always keeps its place, even with the cursor off the drawing. Otherwise moving onto a
  // notice above it hides the readout, the notice drops into its place, and the two flicker.
  return (
    <div
      className={`${styles.statusChip} ${styles.cursorReadout}`}
      aria-live="off"
      data-cursor-readout
      data-idle={cursor ? undefined : 'true'}
    >
      <span className={styles.cursorValue}>
        <span className={styles.cursorAxis}>X</span> {value(cursor?.x)}
      </span>
      <span className={styles.cursorValue}>
        <span className={styles.cursorAxis}>Y</span> {value(cursor?.y)}
      </span>
      {measuring && cursor?.snap ? <span className={styles.cursorTag}>{CAD_SNAP_LABELS[cursor.snap]}</span> : null}
      {measuring && cursor?.lock ? (
        <span className={styles.cursorTag}>{cursor.lock === 90 ? 'Ortho' : `${cursor.lock}° lock`}</span>
      ) : null}
    </div>
  );
}
