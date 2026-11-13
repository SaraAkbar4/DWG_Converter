import type { Metadata } from 'next';
import { LegalPage } from '../../site/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy | Kodifly DWG and DXF viewer',
  description: 'How the Kodifly DWG and DXF viewer handles your drawings and your contact details.',
  alternates: { canonical: '/privacy' },
};

export default function Privacy() {
  return (
    <LegalPage title="Privacy">
      <h2>Your drawings</h2>
      <p>
        Drawings you open are read and displayed inside your browser, on your own device. They are not uploaded to
        Kodifly or to anyone else, and they are not stored: closing or reloading the page removes them from memory.
      </p>
      <h2>Contact details you give us</h2>
      <p>
        If you fill in a form to talk to us, we receive your name, work email, company and
        anything else you type. We use these to reply to you and to tell you about Kodifly products and services, as
        you agreed on the form. The form never includes your drawing.
      </p>
      <h2>What is kept in your browser</h2>
      <p>
        The site keeps your theme choice in your browser&apos;s storage. It holds no personal details.
      </p>
      <h2>Usage statistics</h2>
      <p>
        We may count page visits and actions such as &quot;drawing opened&quot; or &quot;export clicked&quot; with a
        privacy-friendly analytics service that does not use cookies. File names and drawing contents are never sent.
      </p>
      <h2>Questions and requests</h2>
      <p>To see, correct or delete the contact details you gave us, get in touch with Kodifly.</p>
    </LegalPage>
  );
}
