# 🌐 Gloo Platform Portal: Backstage Backend Plugin

This is a plugin for Backstage. The plugin is located in `./backstage/plugins/platform-portal-backstage-plugin-backend`. See the Readme file there for more information.

The rest of this repo is based on the project created by `npx @backstage/create-app@latest`.

---

## 📦 Updating Dependencies

When updating to a newer Backstage version:

1. Rename `./backstage` to `./backstage-old`
2. Run `npx @backstage/create-app@latest` to create a new `./backstage` folder
3. Move `./backstage/plugins/platform-portal-backstage-plugin-backend` to the new project
4. Run `yarn tsc` in `./backstage` to generate types (you may need to build the project)
5. Update `./backstage/packages/backend` to include the plugin
6. Migrate `app-config.local.yaml` and update `app-config.yaml` with the YAML from the plugin readme
7. Delete `./backstage-old`

```bash
mv ./backstage ./backstage-old
npx @backstage/create-app@latest
mkdir -p backstage/plugins/platform-portal-backstage-plugin-backend
cp -rf backstage-old/plugins/platform-portal-backstage-plugin-backend/* backstage/plugins/platform-portal-backstage-plugin-backend
cd backstage
yarn tsc
cd ..
mkdir -p backstage/packages/backend
cp -rf backstage-old/packages/backend/* backstage/packages/backend
cp backstage-old/app-config.yaml backstage/app-config.yaml
cp backstage-old/README.md backstage/README.md

# ⚠️ Ensure the `resolutions` in all `package.json` files remain
# This needs to be done manually

cd backstage
yarn install

rm -rf ./backstage-old
```

---

## 🧪 Testing

There are two ways to test the plugin locally: with the **mock API server** or with **Keycloak + a real portal server**.

### Option 1: Mock Portal API (quick, no external dependencies)

The `mock-portal-api/` folder contains a lightweight Express server that mocks all Gloo Platform Portal API endpoints.

```bash
cd mock-portal-api
yarn install
yarn start
```

This starts the mock server on `http://localhost:31080`. Then configure Backstage in `app-config.local.yaml`:

```yaml
glooPlatformPortal:
  backend:
    portalServerUrl: http://localhost:31080/v1
    tokenEndpoint: http://localhost:31080/auth/realms/master/protocol/openid-connect/token
    clientId: backstage
    clientSecret: mock-secret
```

Then start Backstage:

```bash
cd backstage
yarn && yarn start
```

See [`mock-portal-api/README.md`](./mock-portal-api/README.md) for more details on customizing mock data.

### Option 2: Keycloak + Portal Server (full integration)

This option tests against a real Keycloak instance for OAuth and requires a running portal server.

#### 1️⃣ Start PostgreSQL

```bash
docker run -d \
  --name postgres \
  -e POSTGRES_DB=db \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=pass \
  -p 5432:5432 \
  postgres
```

#### 2️⃣ Start Keycloak

```bash
docker run -d \
  -p 8088:8080 \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD=admin \
  -e KC_HTTP_ENABLED=true \
  -e KC_HOSTNAME_STRICT=false \
  -v $(pwd)/keycloak-realm.json:/opt/keycloak/data/import/realm.json \
  --name keycloak \
  quay.io/keycloak/keycloak:21.1.1 \
  start-dev \
  --import-realm
```

This imports the `backstage` realm from `keycloak-realm.json`, which creates a `backstage` client with **Client Authentication** and **Service Accounts Roles** enabled.

> **Note:** The realm is named `backstage` (not `master`) so that `--import-realm` creates it fresh. Using `"realm": "master"` would cause Keycloak to skip the import since the master realm already exists.

| Setting | Value |
|---------|-------|
| 🔑 Client ID | `backstage` |
| 🔒 Client Secret | `backstage-secret` |
| 🌐 Token Endpoint | `http://localhost:8088/realms/backstage/protocol/openid-connect/token` |
| 🖥️ Admin Console | http://localhost:8088 (`admin`/`admin`) |

#### 3️⃣ Configure and Run

- Ensure `app-config.local.yaml` has the correct client ID, secret, and token endpoint pointing to the `backstage` realm:
  ```yaml
  glooPlatformPortal:
    backend:
      clientId: backstage
      clientSecret: backstage-secret
      tokenEndpoint: http://localhost:8088/realms/backstage/protocol/openid-connect/token
  ```
- Run the Backstage project:
  ```bash
  cd backstage
  yarn && yarn start
  ```

#### ✅ Verify

Verify the token endpoint works before starting Backstage:

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST \
  http://localhost:8088/realms/backstage/protocol/openid-connect/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=client_credentials&client_id=backstage&client_secret=backstage-secret'
# Expected: 200
```

Then check that the `info gloo-platform-portal:` logs show the plugin has started, obtained a token, and is attempting to fetch APIs.

---

## 🚀 Release

1. Merge the PR into `main`
2. Kick off a GitHub release on the repository
3. Verify that the image is built, deployed, and the NPM package is published
