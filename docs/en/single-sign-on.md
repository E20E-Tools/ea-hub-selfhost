# Single sign-on (OpenID Connect)

EA-Hub can let people sign in with their organisation account through any OpenID Connect provider: Microsoft Entra ID (Azure AD), Keycloak, Okta, Auth0, Google Workspace, Authentik, Ping and others. Password sign-in keeps working next to it.

When single sign-on is configured, the admin sign-in page shows a **Sign in with your organisation account** button.

## How access is decided

| Person | What happens at sign-in |
|---|---|
| E-mail domain not in `OIDC_ALLOWED_DOMAINS` (when that list is set) | Refused |
| Verified e-mail listed in `OIDC_ADMIN_EMAILS`, or member of a group in `OIDC_ADMIN_GROUPS` | Signed in. The account is created if needed and gets the **admin** role |
| Already has an EA-Hub account with the same verified e-mail | Signed in to that account. Roles are unchanged |
| Anyone else | Refused, unless `OIDC_AUTO_CREATE=true` **and** `OIDC_ALLOWED_DOMAINS` is set. Then an account without roles is created |

Other rules:

- **Verified e-mail only:** EA-Hub uses an e-mail address to find or create an account only when the provider confirms that address. It accepts either of two claims:
  - `email_verified` set to `true`.
  - Microsoft Entra ID's `xms_edov` set to `true`, meaning the e-mail's domain is verified in your tenant.
- **Unverified e-mails:** if your provider confirms neither, you can set `OIDC_REQUIRE_VERIFIED_EMAIL=false`, but only together with `OIDC_ALLOWED_DOMAINS`. Unverified addresses are then never linked to an existing account and never match `OIDC_ADMIN_EMAILS`: only `OIDC_ADMIN_GROUPS` can make someone an admin.
- **Limit the domains:** always set `OIDC_ALLOWED_DOMAINS` to your own domains. This matters most with shared issuers such as Google (`https://accounts.google.com`), which signs in **any** Google account.
- **Admin rights are only added:** they are never removed automatically. To take admin rights away, remove the role in EA-Hub.
- **Offboarding:** disabling someone at the provider stops new sign-ins at once, but an open EA-Hub session lasts until its refresh token expires (up to 30 days). To end it immediately, block the user in EA-Hub or remove the account.
- **Security checks:**
  - The sign-in uses the authorization code flow with PKCE, `state` and `nonce`.
  - The ID token signature is checked against the provider's published keys, along with the issuer, audience and expiry.
  - The redirect URI is fixed to your `APP_URL`.

## 1. Register EA-Hub at your provider

Each provider needs the same three things:

- **Application type:** web application (confidential client), authorization code flow.
- **Redirect URI:** `https://<your EA-Hub address>/api/selfhost/auth/oidc/callback`, for example `https://hub.example.com/api/selfhost/auth/oidc/callback`.
- **Scopes:** `openid email profile`, plus a groups claim if you use `OIDC_ADMIN_GROUPS`.

Note the **issuer URL**, the **client ID** and the **client secret**.

| Provider | Issuer URL | Notes |
|---|---|---|
| Microsoft Entra ID | `https://login.microsoftonline.com/<tenant-id>/v2.0` | **App registrations → New registration**, platform **Web**, then add a client secret. In **Token configuration → Add optional claim → ID**, add `email` and `xms_edov`. For groups, use **Add groups claim**: Entra sends group **object IDs**, so put those IDs in `OIDC_ADMIN_GROUPS` |
| Keycloak | `https://<keycloak>/realms/<realm>` | Create a client with **Client authentication** on and **Standard flow** on. For groups, add a **Group Membership** mapper with token claim name `groups` and **Full group path** off |
| Okta | `https://<your-org>.okta.com` (or a custom authorization server URL) | Create an **OIDC – Web Application**. For groups, add a `groups` claim to the ID token |
| Google Workspace | `https://accounts.google.com` | Create an **OAuth client ID** of type **Web application**. Google sends no groups claim, so use `OIDC_ADMIN_EMAILS` |
| Authentik | `https://<authentik>/application/o/<app-slug>` | Create an **OAuth2/OpenID Provider** with client type **Confidential** |

## 2. Configure EA-Hub

**Docker Compose:** add to `.env`, then run `docker compose up -d`:

```bash
OIDC_ISSUER=https://login.microsoftonline.com/00000000-0000-0000-0000-000000000000/v2.0
OIDC_CLIENT_ID=11111111-1111-1111-1111-111111111111
OIDC_CLIENT_SECRET=<client secret>
OIDC_ALLOWED_DOMAINS=yourcompany.com
OIDC_ADMIN_EMAILS=you@yourcompany.com
OIDC_ADMIN_GROUPS=                     # optional
```

**Helm:**

```yaml
sso:
  oidc:
    issuer: https://kc.example.com/realms/acme
    clientId: ea-hub
    clientSecret: "<client secret>"     # or key oidc-client-secret in secrets.existingSecret
    allowedDomains: acme.com
    adminGroups: ea-admins
    # adminEmails: you@acme.com
```

**Container-as-a-Service platforms:** set the same `OIDC_*` environment variables. Keep `OIDC_CLIENT_SECRET` in the platform's secret store.

## 3. Try it

Open `https://<your address>/admin`, then click **Sign in with your organisation account**. After your provider's sign-in page, you land back in the admin console.

## All settings

| Variable | Helm value | Default | Meaning |
|---|---|---|---|
| `OIDC_ISSUER` | `sso.oidc.issuer` | – | Provider issuer URL. EA-Hub reads `<issuer>/.well-known/openid-configuration` |
| `OIDC_CLIENT_ID` | `sso.oidc.clientId` | – | Client ID |
| `OIDC_CLIENT_SECRET` | `sso.oidc.clientSecret` | – | Client secret. It is sent with HTTP Basic authentication to the token endpoint |
| `OIDC_SCOPES` | `sso.oidc.scopes` | `openid email profile` | Requested scopes |
| `OIDC_BUTTON_LABEL` | `sso.oidc.buttonLabel` | `Sign in with your organisation account` | Button text |
| `OIDC_ADMIN_EMAILS` | `sso.oidc.adminEmails` | – | Comma-separated e-mails that get the admin role |
| `OIDC_ADMIN_GROUPS` | `sso.oidc.adminGroups` | – | Comma-separated groups whose members get the admin role |
| `OIDC_GROUPS_CLAIM` | `sso.oidc.groupsClaim` | `groups` | ID token claim that lists groups |
| `OIDC_ALLOWED_DOMAINS` | `sso.oidc.allowedDomains` | – | Comma-separated e-mail domains allowed to sign in (recommended) |
| `OIDC_AUTO_CREATE` | `sso.oidc.autoCreate` | `false` | Create accounts, without roles, for anyone from `OIDC_ALLOWED_DOMAINS` |
| `OIDC_REQUIRE_VERIFIED_EMAIL` | `sso.oidc.requireVerifiedEmail` | `true` | Require `email_verified` (or Entra `xms_edov`) to be `true` |

## Troubleshooting

| Message on the sign-in page | Cause |
|---|---|
| *Your organisation account has no access to EA-Hub yet* | The person has no EA-Hub account and is not listed as an admin, or their e-mail domain is not in `OIDC_ALLOWED_DOMAINS`. Create the account in EA-Hub, or list them |
| *Your organisation did not confirm your e-mail address* | The ID token has neither `email_verified=true` nor `xms_edov=true`. On Entra ID, add the `xms_edov` optional claim |
| *Single sign-on did not complete* | Check the app logs for `[selfhost] SSO sign-in failed:`. Common causes are a redirect URI that differs from `APP_URL`, a wrong client secret, or a clock more than 2 minutes off |
| *Single sign-on is unavailable* | EA-Hub could not reach `<issuer>/.well-known/openid-configuration`. Check the issuer URL and outbound network access |
