import { parseUrlParams } from '@/lib/url-params';

describe('parseUrlParams', () => {
  it('parses fragment parameters (magic-link tokens)', () => {
    const params = parseUrlParams('ubuntu://#access_token=abc&refresh_token=def&token_type=bearer');
    expect(params.access_token).toBe('abc');
    expect(params.refresh_token).toBe('def');
    expect(params.token_type).toBe('bearer');
  });

  it('parses query-string parameters', () => {
    const params = parseUrlParams('ubuntu://login?code=1234&state=xyz');
    expect(params.code).toBe('1234');
    expect(params.state).toBe('xyz');
  });

  it('parses both query and fragment, fragment winning on conflicts', () => {
    const params = parseUrlParams('ubuntu://cb?a=query&b=1#a=fragment&c=2');
    expect(params.a).toBe('fragment');
    expect(params.b).toBe('1');
    expect(params.c).toBe('2');
  });

  it('decodes URI-encoded values', () => {
    const params = parseUrlParams('ubuntu://#error_description=Email%20link%20is%20invalid');
    expect(params.error_description).toBe('Email link is invalid');
  });

  it('ignores malformed pairs and empty keys', () => {
    const params = parseUrlParams('ubuntu://#novalue&=orphan&ok=1');
    expect(params.ok).toBe('1');
    expect(Object.keys(params)).toEqual(['ok']);
  });

  it('returns an empty object for a bare URL', () => {
    expect(parseUrlParams('ubuntu://')).toEqual({});
  });
});
