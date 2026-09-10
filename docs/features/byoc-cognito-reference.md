# AWS BYOC: Cognito setup reference

Saved on 2026-09-09 from the user-provided Cognito React quickstart examples.
The snippets below remain unchanged reference material. Small's private login
uses `oidc-client-ts` directly and preserves the existing UI. It does not ship
the quickstart's token display or add `react-oidc-context`.

Related spec: [AWS BYOC CPU-job MVP](byoc-aws.md).

Implementation sequence: [customer-hosted BYOC plan](../../tasks/plan.md) and
[task checklist](../../tasks/todo.md).

## Reported login result

On 2026-09-09, the user reported seeing "Successfully signed in" on Cognito's
default redirect page. This records a successful test of the Cognito login,
as reported by the user. This does not establish a real-user login into Small.

## Verified installation settings

Read from AWS using the Amazon dev box's `default` profile on 2026-09-09:

- AWS account **`503561429929`**, role `DrishtiAdminRole`, region `us-east-1`.
  The pool ARN confirms ownership by that account.
- Managed-login domain:
  `https://us-east-1k3auyahvg.auth.us-east-1.amazoncognito.com`.
- Public SPA client has no secret; code flow is enabled; scopes include
  `openid`, `email`, and `phone`. Small requests `openid email`.
- Self-registration is disabled. `cyudhist@amazon.com` is confirmed; its Cognito
  subject is `f448a498-7051-705b-e988-77d61a114a7c`.
- Before Small installation, the only callback was the supplied CloudFront
  demo URL, and no logout URL was configured. The installer appends the new
  Small `/auth/callback` and `/login` URLs while preserving that callback.

Installed Small URL: **https://d3sgti338uxlc.cloudfront.net/apps**.
Callback: `https://d3sgti338uxlc.cloudfront.net/auth/callback`.
Sign-out return: `https://d3sgti338uxlc.cloudfront.net/login`.
AWS readback confirmed both were added and the original callback remains.
The real managed-login page uses **Email address → Next**; it does not show
the password field on its first screen. On 2026-09-09, the user confirmed that
sign-in to this deployed Small dashboard works with their existing account.

The private build and synthetic browser login/callback/logout checks pass.
See [the installation status](byoc-aws.md#private-installation-first-dashboard-milestone)
for the actual AWS deployment; the original JSX examples below are not its code.

## Supplied configuration

| Setting | Value |
| --- | --- |
| Application type | Single-page application (SPA) |
| Application name | `small-deploy` |
| AWS region | `us-east-1` |
| User pool ID | `us-east-1_K3auyaHVg` |
| App client ID | `3auv96ol86dhoic2c04n5sfo2n` |
| Authority | `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_K3auyaHVg` |
| Return URL in supplied example | `https://d84l1y8p4kdic.cloudfront.net` |
| Response type | `code` |
| Scopes in supplied example | `phone openid email` |
| Sign-in identifier | Email |
| Required attribute | `email` |
| Self-registration | Disabled, as reported by the user |

The CloudFront URL is copied from the supplied example. Its ownership,
deployment contents, and callback configuration have not been verified.

## index.js

```jsx
// index.js
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "react-oidc-context";

const cognitoAuthConfig = {
  authority: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_K3auyaHVg",
  client_id: "3auv96ol86dhoic2c04n5sfo2n",
  redirect_uri: "https://d84l1y8p4kdic.cloudfront.net",
  response_type: "code",
  scope: "phone openid email",
};

const root = ReactDOM.createRoot(document.getElementById("root"));

// wrap the application with AuthProvider
root.render(
  <React.StrictMode>
    <AuthProvider {...cognitoAuthConfig}>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
```

## App.js

```jsx
// App.js

import { useAuth } from "react-oidc-context";

function App() {
  const auth = useAuth();

  const signOutRedirect = () => {
    const clientId = "3auv96ol86dhoic2c04n5sfo2n";
    const logoutUri = "<logout uri>";
    const cognitoDomain = "https://<user pool domain>";
    window.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
  };

  if (auth.isLoading) {
    return <div>Loading...</div>;
  }

  if (auth.error) {
    return <div>Encountering error... {auth.error.message}</div>;
  }

  if (auth.isAuthenticated) {
    return (
      <div>
        <pre> Hello: {auth.user?.profile.email} </pre>
        <pre> ID Token: {auth.user?.id_token} </pre>
        <pre> Access Token: {auth.user?.access_token} </pre>
        <pre> Refresh Token: {auth.user?.refresh_token} </pre>

        <button onClick={() => auth.removeUser()}>Sign out</button>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => auth.signinRedirect()}>Sign in</button>
      <button onClick={() => signOutRedirect()}>Sign out</button>
    </div>
  );
}

export default App;
```

## Reference integration notes

- Use the installed Small URL from the stack outputs for its callback.
- Replace `<logout uri>` and `<user pool domain>` with the configured sign-out
  URL and Cognito managed-login domain. The authority URL above identifies the
  user pool; it is not the managed-login domain.
- Preserve these examples as supplied. The product UI must omit their token
  display, including the refresh token. Review the two sign-out paths during
  integration so local session removal and Cognito logout behave consistently.
