import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { App } from './App';

test('initial render works without browser APIs and shows the ready preset', () => {
  const html = renderToStaticMarkup(<App />);

  expect(html).toContain('Jam makan siang');
  expect(html).toContain('Siap dijalankan');
  expect(html).toContain('id="primary-action"');
  expect(html).toContain('value="2026"');
});
