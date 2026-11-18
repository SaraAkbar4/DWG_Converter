import { Alert, Button, Modal, Radio, Segmented, Select } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { CadExporter } from '../cad/CadDrawingViewer';
import type { Bounds } from '../cad/cadGeometry';
import { renderSheetPng } from './exportDrawing';
import {
  DPI_CHOICES,
  PAPER_MM,
  SCALES,
  formatScale,
  orientationFor,
  scaleLayout,
  sheetLayout,
  type Orientation,
  type PaperName,
  type SheetLayout,
} from './exportSheet';
import styles from './site.module.css';

/** What part of the drawing goes on the sheet. ShareCAD calls these the print area. */
export type ExportArea = 'drawing' | 'view' | 'picked';

const PREVIEW_WIDTH = 520;
const PREVIEW_DELAY_MS = 120;
const FIT = 'fit';

type Props = {
  open: boolean;
  exporter: CadExporter | null;
  stem: string;
  /** The part of the screen in view when the dialog opened. */
  viewBounds: Bounds | null;
  /** The area chosen on the drawing, once there is one. */
  picked: Bounds | null;
  area: ExportArea;
  onArea: (area: ExportArea) => void;
  /** Hide the dialog and let the user drag out an area. */
  onChooseArea: () => void;
  onCancel: () => void;
  onDownload: (layout: SheetLayout) => void;
};

/** Paper, scale and area for a PNG, with a preview of the sheet, before it downloads. */
export function ExportDialog({ open, exporter, stem, viewBounds, picked, area, onArea, onChooseArea, onCancel, onDownload }: Props) {
  const [paper, setPaper] = useState<PaperName>('A4');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [scale, setScale] = useState<number | typeof FIT>(FIT);
  const [dpi, setDpi] = useState<number>(300);
  const [preview, setPreview] = useState<string | null>(null);

  const bounds = area === 'drawing' ? (exporter?.bounds ?? null) : area === 'view' ? viewBounds : picked;
  const metersPerUnit = exporter?.metersPerUnit ?? null;

  // A new area gets the orientation that suits its shape; the user can still turn it after.
  useEffect(() => {
    if (bounds) setOrientation(orientationFor(bounds));
  }, [bounds]);

  const layout = useMemo(
    () =>
      bounds
        ? sheetLayout(bounds, { paper, orientation, scale: scale === FIT ? null : scale, dpi }, metersPerUnit)
        : null,
    [bounds, paper, orientation, scale, dpi, metersPerUnit],
  );

  useEffect(() => {
    if (!open || !exporter || !layout) {
      setPreview(null);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const small = scaleLayout(layout, PREVIEW_WIDTH / Math.max(layout.width, layout.height));
      void renderSheetPng(exporter, small, stem).then((sheet) => {
        if (!cancelled && sheet) setPreview(sheet.toDataURL('image/png'));
      });
    }, PREVIEW_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, exporter, layout, stem]);

  const [short, long] = PAPER_MM[paper];
  const paperMm = orientation === 'landscape' ? `${long} × ${short} mm` : `${short} × ${long} mm`;

  return (
    <Modal
      open={open}
      title="Export PNG"
      onCancel={onCancel}
      width={820}
      centered
      destroyOnHidden={false}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button key="download" type="primary" disabled={!layout} onClick={() => layout && onDownload(layout)}>
          Download PNG
        </Button>,
      ]}
    >
      <div className={styles.exportDialog}>
        <div className={styles.exportOptions}>
          <fieldset className={styles.exportGroup}>
            <legend>Print area</legend>
            <Radio.Group
              value={area}
              onChange={(event) => {
                const next = event.target.value as ExportArea;
                if (next === 'picked') {
                  onChooseArea();
                  return;
                }
                onArea(next);
              }}
              className={styles.exportRadios}
            >
              <Radio value="drawing">Whole drawing</Radio>
              <Radio value="view" disabled={!viewBounds}>
                Current view
              </Radio>
              <Radio value="picked">Area you choose</Radio>
            </Radio.Group>
          </fieldset>

          <fieldset className={styles.exportGroup}>
            <legend>Paper</legend>
            <div className={styles.exportRow}>
              <Select<PaperName>
                aria-label="Paper size"
                value={paper}
                onChange={setPaper}
                options={(Object.keys(PAPER_MM) as PaperName[]).map((name) => ({ value: name, label: name }))}
                style={{ width: 90 }}
              />
              <Segmented<Orientation>
                aria-label="Orientation"
                value={orientation}
                onChange={setOrientation}
                options={[
                  { value: 'portrait', label: 'Portrait' },
                  { value: 'landscape', label: 'Landscape' },
                ]}
              />
            </div>
            <span className={styles.exportHint}>{paperMm}</span>
          </fieldset>

          <fieldset className={styles.exportGroup}>
            <legend>Scale</legend>
            <Select<number | typeof FIT>
              aria-label="Scale"
              value={metersPerUnit ? scale : FIT}
              onChange={setScale}
              disabled={!metersPerUnit}
              options={[
                { value: FIT, label: 'Fit to paper' },
                ...SCALES.map((n) => ({ value: n, label: formatScale(n) })),
              ]}
              style={{ width: '100%' }}
            />
            <span className={styles.exportHint}>
              {!metersPerUnit
                ? 'This drawing has no units, so it is fitted to the paper.'
                : layout?.scaleN
                  ? scale === FIT
                    ? `Fitted at about ${formatScale(layout.scaleN)}`
                    : `Measured lengths on paper are 1/${scale} of real size.`
                  : null}
            </span>
          </fieldset>

          <fieldset className={styles.exportGroup}>
            <legend>Resolution</legend>
            <Segmented<number>
              aria-label="Resolution"
              value={dpi}
              onChange={setDpi}
              options={DPI_CHOICES.map((value) => ({ value, label: `${value} dpi` }))}
            />
            {layout && (
              <span className={styles.exportHint}>
                {layout.width.toLocaleString('en-US')} × {layout.height.toLocaleString('en-US')} px
                {layout.dpi < dpi ? ` · ${layout.dpi} dpi, the most a browser can draw at ${paper}` : ''}
              </span>
            )}
          </fieldset>
        </div>

        <div className={styles.exportPreview}>
          {preview ? (
            <img src={preview} alt={`Preview of the ${paper} sheet`} />
          ) : (
            <span className={styles.exportHint}>{bounds ? 'Drawing the preview…' : 'Choose an area to see a preview.'}</span>
          )}
          {layout && !layout.fits && (
            <Alert
              type="warning"
              showIcon
              message={`At ${scale === FIT ? 'this scale' : formatScale(scale)} the area is larger than ${paper}, so its edges are cut off. Pick a larger paper or a smaller scale.`}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
