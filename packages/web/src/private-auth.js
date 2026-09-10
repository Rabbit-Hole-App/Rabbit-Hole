import { InMemoryWebStorage, UserManager, WebStorageStateStore } from 'oidc-client-ts';

export const isPrivateByoc = import.meta.env?.VITE_PRIVATE_BYOC === 'true';

export function returnPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/apps';
  const url = new URL(value, 'https://small.invalid');
  return /^\/(apps(?:\/[a-z0-9-]+(?:\/runs\/[\w-]+)?)?|members|chat)$/.test(url.pathname)
    ? url.pathname + url.search : '/apps';
}

export function oidcSettings(config, origin, storage) {
  if (!/^https:\/\/cognito-idp\.us-east-1\.amazonaws\.com\/us-east-1_[A-Za-z0-9]+$/.test(config.issuer)
      || !/^[a-z0-9]{1,128}$/.test(config.clientId)
      || !/^https:\/\/[a-z0-9-]+\.auth\.us-east-1\.amazoncognito\.com$/.test(config.cognitoDomain)) {
    throw new Error('Invalid Cognito installation settings');
  }
  const url = new URL(origin);
  if (url.origin !== origin || (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Small requires an HTTPS installation URL');
  }
  return {
    authority: config.issuer, client_id: config.clientId, redirect_uri: origin + '/auth/callback',
    response_type: 'code', scope: 'openid email', automaticSilentRenew: false, loadUserInfo: false,
    // Tokens live only in memory. Only the one-use PKCE transaction survives a redirect.
    userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
    stateStore: new WebStorageStateStore({ store: storage, prefix: 'small.cognito.state.' }),
    metadata: { issuer: config.issuer, authorization_endpoint: config.cognitoDomain + '/oauth2/authorize',
      token_endpoint: config.cognitoDomain + '/oauth2/token', userinfo_endpoint: config.cognitoDomain + '/oauth2/userInfo',
      jwks_uri: config.issuer + '/.well-known/jwks.json', revocation_endpoint: config.cognitoDomain + '/oauth2/revoke' },
  };
}

// Keep redirect handling ahead of the shared application's route normalization.
export function authClient(manager, config, browser) {
  let renewing;
  const next = () => returnPath(new URLSearchParams(browser.location.search).get('next')
    || browser.location.pathname + browser.location.search);
  const signIn = () => manager.signinRedirect({ state: { next: next() } });
  return {
    signIn,
    async start() {
      if (browser.location.pathname === '/auth/callback') {
        try {
          const user = await manager.signinRedirectCallback(browser.location.href);
          browser.history.replaceState(null, '', returnPath(user.state?.next));
          return true;
        } catch (error) {
          browser.history.replaceState(null, '', '/login'); // remove the code even on failure
          throw error;
        }
      }
      if (browser.location.pathname === '/logout') {
        const user = await manager.getUser();
        if (user?.refresh_token) {
          try { await manager.revokeTokens(['refresh_token']); } catch { /* Cognito logout still clears the login session. */ }
        }
        await manager.removeUser();
        for (const key of Object.keys(browser.sessionStorage)) {
          if (key.startsWith('small.cognito.state.')) browser.sessionStorage.removeItem(key);
        }
        const url = new URL(config.cognitoDomain + '/logout');
        url.searchParams.set('client_id', config.clientId);
        url.searchParams.set('logout_uri', browser.location.origin + '/login');
        browser.location.assign(url.href);
        return false;
      }
      if (browser.location.pathname === '/login') return false;
      if (await manager.getUser()) return true;
      await signIn(); // Cognito's own session restores login after a page reload.
      return false;
    },
    async headers(path) {
      const target = new URL(path, browser.location.origin);
      if (!path.startsWith('/api/') || path.includes('\\') || target.origin !== browser.location.origin) {
        throw new Error('Private credentials can only be sent to this installation');
      }
      let user = await manager.getUser();
      if (user?.expired && user.refresh_token) {
        renewing ||= manager.signinSilent().finally(() => { renewing = null; });
        user = await renewing;
      }
      if (!user || user.expired || !user.access_token) throw Object.assign(new Error('Sign in to Small'), { status: 401 });
      return { Authorization: 'Bearer ' + user.access_token };
    },
  };
}

let pending;
export function privateAuth() {
  pending ||= (async () => {
    const response = await fetch('/api/auth/config', { credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw new Error('Small login is unavailable');
    const config = await response.json();
    const manager = new UserManager(oidcSettings(config, window.location.origin, window.sessionStorage));
    await manager.clearStaleState();
    return authClient(manager, config, window);
  })().catch((error) => { pending = null; throw error; });
  return pending;
}
