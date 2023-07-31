# @solo.io/platform-portal-backstage-plugin-backend

## Description

This plugin will create the following Backstage catalog entities and relate them to each other:

- A `Group` with the name, `solo-io-service-accounts`.
- A `User` with the name, `gloo-platform-portal-service-account`.
- A `System` with the name, `gloo-platform-portal-apis`.
- An `API` for each `apiVersion` of each `apiProduct` in your Gloo Platform Portal instance that the service account has access to. The API's name is a combination of the `apiProductId` and the `apiVersion` (`apiProductId-apiVersion`).

## Installation

1. Install the plugin to your backstage instance:

```shell
yarn add --cwd ./packages/backend @solo.io/platform-portal-backstage-plugin-backend
```

2. Update your backend plugin in `packages/backend/src/plugins/catalog.ts` with the following code. The parts that you will need to update should similar to what is described in the Backstage docs [here](https://backstage.io/docs/features/software-catalog/external-integrations/#installing-the-provider):

```ts
// ...
import { GlooPlatformPortalProvider } from '@solo.io/platform-portal-backstage-plugin-backend';
// ...
export default async function createPlugin(
  env: PluginEnvironment,
  // ...
): Promise<Router> {
  // ...

  const gppp = new GlooPlatformPortalProvider(
    'production',
    env.logger,
    env.config,
  );
  builder.addEntityProvider(gppp);

  const { processingEngine, router } = await builder.build();
  await processingEngine.start();

  await gppp.startScheduler(env.scheduler);

  //...
}
```

3. Update the `app-config.local` file for your backstage instance to include the following values, which should match your authorization server deployment:

```yaml
glooPlatformPortal:
  portalServerUrl: http://localhost:31080/v1
  clientId: // Update with your client id
  clientSecret: // Update with your client secret
  tokenEndpoint: // Update with your token endpoint
  serviceAccountUsername: // The username of the service account that can access your APIs.
  serviceAccountPassword: // The password of the service account that can access your APIs.
  // This is optional. Defaults to false.
  debugLogging: false
  // This is optional.
  syncFrequency:
    hours: 0
    minutes: 1
    seconds: 0
    milliseconds: 0
  // This is optional.
  syncTimeout:
    hours: 0
    minutes: 0
    seconds: 10
    milliseconds: 0
```

## Demo Image

Solo.io provides a demo Backstage image with the `@solo.io/platform-portal-backstage-plugin-backend` package installed. It contains an `app-config.yaml` file which can be configured using Docker environment variables.

To begin the demo, make sure that:

- You can access the portal server and view the Gloo Platform APIs you have access to through a URL that Docker can access (like [http://localhost:31080/v1/apis](http://localhost:31080/v1/apis))
- You have an authorization server (like Keycloak or Okta) running that Docker can access.

Then run a Postgres container for the Backstage catalog (this creates an example user for the demo):

```sh
docker run \
--name backstage-postgres \
-e POSTGRES_USER=postgres \
-e POSTGRES_PASSWORD=password \
-it -p 5432:5432 \
-d postgres:bookworm &
```

Then run the Backstage example app, replacing any environment variables as-needed. This example uses gcr.io/solo-public/docs/portal-backstage-backend:latest, but you can check the GitHub release versions [here](https://github.com/solo-io/platform-portal-backstage-plugin-backend/releases). `host.docker.internal`.

```sh
docker run \
--name backstage \
-e PORTAL_SERVER_URL=http://host.docker.internal:31080/v1  # replace \
-e CLIENT_ID= # replace \
-e CLIENT_SECRET= # replace  \
-e TOKEN_ENDPOINT=http://host.docker.internal:8088/realms/master/protocol/openid-connect/token # replace \
-e PORTAL_SERVICE_ACCOUNT_USERNAME= # replace \
-e PORTAL_SERVICE_ACCOUNT_PASSWORD= # replace \
-e POSTGRES_USER=postgres \
-e POSTGRES_PASSWORD=password \
-e POSTGRES_HOST=host.docker.internal \
-it -p 7007:7007 gcr.io/solo-public/docs/portal-backstage-backend:latest
```

Here is the list of Docker environment variables that this package adds to the Backstage `app-config.yaml`.

```yaml
backend:
  database:
    client: pg
    connection:
      host: ${POSTGRES_HOST}
      port: ${POSTGRES_PORT}
      user: ${POSTGRES_USER}
      password: ${POSTGRES_PASSWORD}
glooPlatformPortal:
  portalServerUrl: ${PORTAL_SERVER_URL}
  clientId: ${CLIENT_ID}
  clientSecret: ${CLIENT_SECRET}
  tokenEndpoint: ${TOKEN_ENDPOINT}
  serviceAccountUsername: ${PORTAL_SERVICE_ACCOUNT_USERNAME}
  serviceAccountPassword: ${PORTAL_SERVICE_ACCOUNT_PASSWORD}
  debugLogging: ${PORTAL_DEBUG_LOGGING}
  syncTimeout:
    hours: ${PORTAL_SYNC_TIMEOUT_HOURS}
    minutes: ${PORTAL_SYNC_TIMEOUT_MINUTES}
    seconds: ${PORTAL_SYNC_TIMEOUT_SECONDS}
    milliseconds: ${PORTAL_SYNC_TIMEOUT_MILLISECONDS}
  syncFrequency:
    hours: ${PORTAL_SYNC_FREQUENCY_HOURS}
    minutes: ${PORTAL_SYNC_FREQUENCY_MINUTES}
    seconds: ${PORTAL_SYNC_FREQUENCY_SECONDS}
    milliseconds: ${PORTAL_SYNC_FREQUENCY_MILLISECONDS}
```
