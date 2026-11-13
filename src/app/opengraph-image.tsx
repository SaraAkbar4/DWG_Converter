import { ImageResponse } from 'next/og';

export const alt = 'Open DWG and DXF drawings in your browser';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Social preview card shared by every page. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 96,
          background: '#090a0f',
          color: '#f0f2f7',
        }}
      >
        <div style={{ display: 'flex', fontSize: 30, color: '#6b9aff' }}>Kodifly · free CAD viewer</div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 24, fontSize: 84, fontWeight: 700, lineHeight: 1.08 }}>
          <span>Open DWG and DXF drawings</span>
          <span style={{ color: '#6b9aff' }}>in your browser</span>
        </div>
        <div style={{ display: 'flex', marginTop: 36, fontSize: 32, color: '#b4b9c5' }}>
          No AutoCAD. No account. Nothing is uploaded.
        </div>
      </div>
    ),
    size,
  );
}
