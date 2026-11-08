import fetchMock from 'jest-fetch-mock';

const SIGN_IN = {
  scopes: ['openid'],
  redirectURI: 'http://127.0.0.1/stylebot-auth',
  verifier: 'verifier',
  state: 'state',
};

/**
 * The module as a build with this client id, or none, would have it.
 */
const loadWithClientId = (
  clientId: string | undefined
): typeof import('./desktop-client') => {
  const saved = process.env.STYLEBOT_GOOGLE_CLIENT_ID;
  let loaded: typeof import('./desktop-client') | undefined;

  if (clientId === undefined) {
    delete process.env.STYLEBOT_GOOGLE_CLIENT_ID;
  } else {
    process.env.STYLEBOT_GOOGLE_CLIENT_ID = clientId;
  }

  jest.isolateModules(() => {
    loaded = require('./desktop-client');
  });
  process.env.STYLEBOT_GOOGLE_CLIENT_ID = saved;

  return loaded as typeof import('./desktop-client');
};

describe('the Desktop OAuth client', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  it('signs in as the client the build sets', async () => {
    const { getAuthURL } = loadWithClientId(
      'built-in.apps.googleusercontent.com'
    );
    const url = new URL(await getAuthURL(SIGN_IN));

    expect(url.searchParams.get('client_id')).toBe(
      'built-in.apps.googleusercontent.com'
    );
  });

  it('stops before reaching Google in a build without a client', async () => {
    const { getAuthURL, requestToken } = loadWithClientId(undefined);

    await expect(getAuthURL(SIGN_IN)).rejects.toMatchObject({
      code: 'sign-in',
      message: 'Google sign-in is not set up in this build',
    });
    await expect(
      requestToken({ grant_type: 'refresh_token', refresh_token: 'r' })
    ).rejects.toMatchObject({ code: 'sign-in' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
