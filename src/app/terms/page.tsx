import type { Metadata } from 'next';
import { LegalPage } from '../../site/LegalPage';

export const metadata: Metadata = {
  title: 'Terms | Kodifly DWG and DXF viewer',
  description: 'Terms of use for the Kodifly DWG and DXF viewer.',
  alternates: { canonical: '/terms' },
};

export default function Terms() {
  return (
    <LegalPage title="Terms of use">
      <h2>The service</h2>
      <p>
        This site lets you view DWG and DXF drawings in your browser, free of charge. It is provided as it is, without
        any guarantee that every drawing will open or be displayed exactly as in the software that created it.
      </p>
      <h2>Check before you rely on it</h2>
      <p>
        The viewer is for looking at drawings. Measurements and exports are a convenience and can differ from the
        original. Do not use them for construction, fabrication or any decision where accuracy matters without
        checking against the original drawing.
      </p>
      <h2>Your drawings stay yours</h2>
      <p>
        Your drawings are processed on your device and are not uploaded, so Kodifly takes no rights in them. Open only
        drawings you are allowed to view.
      </p>
      <h2>Changes</h2>
      <p>We may change or withdraw the viewer, and update these terms, at any time.</p>
    </LegalPage>
  );
}
