# Copilot Web API + Auth Specification (Field Notes)

Audience: engineers building a production-quality Copilot client.

## High-level architecture

- Primary API: GraphQL over HTTPS.
- Endpoint: `https://app.copilot.money/api/graphql`.
- Authentication: Firebase Auth ID token (JWT) sent as `Authorization: Bearer <ID_TOKEN>`.
- Supporting services used by the web app:
  - Firebase Identity Toolkit (account lookup and sign-in).
  - Firebase Secure Token API (refresh token exchange).
  - Firestore Listen (realtime updates over long-polling channels).

## Authentication model

### Token types

- **ID token (JWT)**: short-lived (typically ~1 hour), used as the Bearer token for GraphQL requests.
- **Refresh token**: long-lived; used to mint new ID tokens via the Secure Token API. It can rotate.

### Obtaining/refreshing tokens

Use the Firebase Secure Token API to exchange a refresh token for a new ID token:

```
POST https://securetoken.googleapis.com/v1/token?key=<COPILOT_API_KEY>
content-type: application/x-www-form-urlencoded

grant_type=refresh_token&refresh_token=<COPILOT_REFRESH_TOKEN>
```

Response fields:
- `id_token`: the JWT to use as the Bearer token.
- `access_token`: typically the same JWT as `id_token` in Firebase Auth.
- `expires_in`: seconds until expiration.
- `refresh_token`: may rotate; persist the latest one.
- `user_id`, `project_id`.

Notes:
- Firebase does not support extending ID token lifetime via parameters.
- Always refresh before expiration; use a small buffer (e.g., 60s).

### Where the web app stores tokens (for reference)

- IndexedDB: `firebaseLocalStorageDb` → `firebaseLocalStorage` → key `firebase:authUser:<apiKey>:[DEFAULT]`.
- Token is in `stsTokenManager.accessToken` (JWT).

## GraphQL API usage

### Endpoint

```
POST https://app.copilot.money/api/graphql
```

### Required headers

- `content-type: application/json`
- `authorization: Bearer <ID_TOKEN>`

No other headers are required for basic requests. Browser-specific headers and cookies can be omitted for non-browser clients.

### Request format

Typical JSON body:

```
{
  "operationName": "UpcomingRecurrings",
  "variables": {},
  "query": "query UpcomingRecurrings { ... }"
}
```

The web app uses Apollo, but the API accepts standard GraphQL POSTs.

## Firestore realtime (optional)

The web app opens Firestore Listen channels for realtime updates. A production client can ignore this and rely on polling GraphQL until realtime is required.

## Security guidance (production)

- Treat refresh tokens as long-lived secrets.
- Expect refresh token rotation; always persist the newest refresh token returned by the token exchange.
- Implement standard token revocation handling (sign-out, password changes, or provider revocations).
- Avoid logging tokens or full Authorization headers.

## Operational considerations

- Token refresh failure: handle HTTP errors and fall back to re-auth if refresh token is invalid or revoked.
- Retry strategy: standard exponential backoff for transient failures.
- Schema discovery: inspect GraphQL operations used by the web app via DevTools network to expand supported features.

## Schema discovery workflow (recommended)

1) **Capture operations from the web app**
   - Open DevTools -> Network -> filter `api/graphql`.
   - Use "Copy as cURL" to capture request bodies; reduce to minimal headers.
   - Extract `operationName`, `query`, and `variables` into your client.

2) **Normalize and catalog**
   - Store each query/mutation in a dedicated file with a stable name.
   - Track variables and expected response shape.
   - Keep a changelog of observed operations and fields.

3) **Build a typed surface**
   - Define TypeScript interfaces for each response.
   - Add runtime validation if desired (zod/io-ts).
   - Map to domain models for downstream use.

4) **Regression checks**
   - Re-capture key operations after app updates.
   - Alert on field removals/renames and auth behavior changes.

## Auth/token lifecycle state machine (suggested)

States:
- `Uninitialized`: no tokens in memory.
- `HasRefreshToken`: refresh token loaded from secure storage.
- `Refreshing`: in-flight call to Secure Token API.
- `Authenticated`: valid ID token cached with expiration.
- `Expired`: ID token expired or near expiry.
- `Revoked`: refresh token invalid or revoked.
- `Error`: transient failure (network, 5xx).

Transitions:
- `Uninitialized` -> `HasRefreshToken`: load refresh token from storage.
- `HasRefreshToken` -> `Refreshing`: request new ID token.
- `Refreshing` -> `Authenticated`: token exchange success; cache `id_token` and `expiresAt`.
- `Authenticated` -> `Expired`: token nearing expiry; proactively refresh.
- `Expired` -> `Refreshing`: refresh token exchange.
- `Refreshing` -> `Revoked`: 400/401 from token endpoint; force re-auth.
- `Any` -> `Error`: transient failure; retry with backoff.
- `Error` -> `Refreshing`: retry success path.

Implementation notes:
- Use a refresh buffer (e.g., 60s) to avoid edge expiry during requests.
- Serialize refreshes to avoid thundering-herd token refresh.
- Persist rotated refresh tokens immediately.
