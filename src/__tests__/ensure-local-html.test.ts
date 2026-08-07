import { htmlNeedsLocalRewrite } from '@/study/ensure-local-html';

describe('ensure-local-html', () => {
  it('detects remote content-addressed URLs', () => {
    expect(
      htmlNeedsLocalRewrite(
        '<img src="https://192.168.1.114:9000/expertlearner-assets/assets/ca/ab/abcd1234.png" />',
      ),
    ).toBe(true);
  });

  it('detects root-relative ca paths', () => {
    expect(htmlNeedsLocalRewrite('<img src="/assets/ca/ab/abcd1234.png" />')).toBe(true);
  });

  it('skips already-local file URIs', () => {
    expect(
      htmlNeedsLocalRewrite('<img src="file:///data/pack-assets/ca/ab/abcd1234.png" />'),
    ).toBe(false);
  });

  it('skips empty html', () => {
    expect(htmlNeedsLocalRewrite('')).toBe(false);
    expect(htmlNeedsLocalRewrite(null)).toBe(false);
  });
});
