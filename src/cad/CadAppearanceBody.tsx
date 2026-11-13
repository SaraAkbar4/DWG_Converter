import { Segmented } from 'antd';
import styles from './cadFloorPlan.module.css';
import { useViewerTranslate } from './platform';
import type { CadColorMode, CadLook, CadStyle } from './types';

type Props = {
  style: CadStyle;
  imageAvailable: boolean;
  translated: boolean;
  onChange: (style: CadStyle) => void;
};

export function CadAppearanceBody({ style, imageAvailable, translated, onChange }: Props) {
  const t = useViewerTranslate();
  const drawingOnly = style.look !== 'drawing';

  return (
    <div>
      <section className={styles.panelSection}>
        <p className={styles.panelCaption}>{t('viewer3d.cadFloorPlan.view', 'View')}</p>
        <Segmented<CadLook>
          block
          value={style.look}
          onChange={(look) => onChange({ ...style, look })}
          options={[
            { value: 'drawing', label: t('viewer3d.cadFloorPlan.lookDrawing', 'Drawing') },
            { value: 'print', label: t('viewer3d.cadFloorPlan.lookPrint', 'Print') },
            { value: 'image', label: t('viewer3d.cadFloorPlan.lookImage', 'Image'), disabled: !imageAvailable },
          ]}
        />
      </section>
      {drawingOnly ? (
        <p className={styles.note}>
          {t('viewer3d.cadFloorPlan.styleDrawingOnly', 'These settings apply to the Drawing view.')}
        </p>
      ) : null}
      <section className={styles.panelSection}>
        <p className={styles.panelCaption}>{t('viewer3d.cadFloorPlan.lineColour', 'Line colour')}</p>
        <Segmented<CadColorMode>
          block
          disabled={drawingOnly}
          value={style.colorMode}
          onChange={(colorMode) => onChange({ ...style, colorMode })}
          options={[
            { value: 'layer', label: t('viewer3d.cadFloorPlan.cadColours', 'CAD colours') },
            { value: 'mono', label: t('viewer3d.cadFloorPlan.monochrome', 'Monochrome') },
          ]}
        />
      </section>
      <section className={styles.panelSection}>
        <p className={styles.panelCaption}>{t('viewer3d.cadFloorPlan.background', 'Background')}</p>
        <Segmented<CadStyle['paper']>
          block
          disabled={drawingOnly}
          value={style.paper}
          onChange={(paper) => onChange({ ...style, paper })}
          options={[
            { value: 'auto', label: t('viewer3d.cadFloorPlan.paperDefault', 'Default') },
            { value: 'light', label: t('viewer3d.cadFloorPlan.light', 'Light') },
            { value: 'dark', label: t('viewer3d.cadFloorPlan.dark', 'Dark') },
          ]}
        />
      </section>
      <section className={styles.panelSection}>
        <p className={styles.panelCaption}>{t('viewer3d.cadFloorPlan.metricGrid', 'Metric grid')}</p>
        <label className={styles.switchRow}>
          <span>{t('viewer3d.cadFloorPlan.showGrid', 'Show grid in metres')}</span>
          <input
            className={styles.switch}
            type="checkbox"
            role="switch"
            disabled={drawingOnly}
            checked={style.grid}
            onChange={(event) => onChange({ ...style, grid: event.target.checked })}
          />
        </label>
      </section>
      {translated ? (
        <section className={styles.panelSection}>
          <p className={styles.panelCaption}>{t('viewer3d.cadFloorPlan.labelLanguage', 'Labels')}</p>
          <Segmented<'english' | 'original'>
            block
            value={style.english ? 'english' : 'original'}
            onChange={(value) => onChange({ ...style, english: value === 'english' })}
            options={[
              { value: 'english', label: t('viewer3d.cadFloorPlan.labelsEnglish', 'English') },
              { value: 'original', label: t('viewer3d.cadFloorPlan.labelsOriginal', 'Original') },
            ]}
          />
        </section>
      ) : null}
    </div>
  );
}
