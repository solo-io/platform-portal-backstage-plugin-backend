# @solo.io/platform-portal-backstage-plugin-backend

> [!NOTE]
> This plugin works with the following portal server backends:
>
> - Gloo Gateway v1.18+
> - Gloo Mesh Gateway v2.4.0+

## Description

This plugin will create the following Backstage catalog entities and relate them to each other:

- A `Group` with the name, `solo-io-service-accounts`.
- A `User` with the name, `gloo-platform-portal-service-account`.
- A `System` with the name, `gloo-platform-portal-apis`.
- An `API` for each `apiVersion` of each `apiProduct` in your Gloo Platform Portal instance that the service account has access to. The API's name is a combination of the `apiProductId` and the `apiVersion` (`apiProductId-apiVersion`).

## Installation

1. Install the plugin to your backstage instance:

> &#x26a0;&#xfe0f; Projects that use an older version of Backstage (prior to `v1.27.0`) should use [@solo.io/platform-portal-backstage-plugin-backend@0.0.25](https://www.npmjs.com/package/@solo.io/platform-portal-backstage-plugin-backend/v/0.0.25).

```shell
yarn add --cwd ./packages/backend @solo.io/platform-portal-backstage-plugin-backend
```

2. Update your backend plugin in `packages/backend/src/index.ts` with the following code. The parts that you will need to update should similar to what is described in the Backstage docs [here](https://backstage.io/docs/features/software-catalog/external-integrations/#new-backend-system). The lines to create the backend variable and start the backend should already exist, and are included here as a frame of reference.

> [!TIP]
> Users can also transform the Entity that is added to the catalog by defining an `entityTransformation` function, like the one that is outlined in the commented out code below.

```ts
// ...
// -> 1. Add the imports in.
import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { Entity } from '@backstage/catalog-model';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node/alpha';
import {
  API,
  ApiVersion,
  GlooPlatformPortalProvider,
} from '@solo.io/platform-portal-backstage-plugin-backend';

// -> 2. Optionally define an `entityTransformation`.
// Entities can be transformed using this function.
// The entity that is returned here will be added to the catalog.
const entityTransformation = async (entity: Entity, api: ApiVersion | API) => {
  // The following commented out lines would add an "example-" prefix to your Entities.
  // return {
  //   ...entity,
  //   metadata: {
  //     ...entity.metadata,
  //     title: 'example-' + (entity?.metadata?.title ?? ''),
  //   },
  // };
  return entity;
};

// -> 3. Create the provider for our plugin.
export const catalogGlooPlatformPortalBackendProvider = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'gloo-platform-portal-backend-provider',
  register(env) {
    env.registerInit({
      deps: {
        catalog: catalogProcessingExtensionPoint,
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        scheduler: coreServices.scheduler,
      },
      async init({ catalog, logger, config, scheduler }) {
        catalog.addEntityProvider(
          new GlooPlatformPortalProvider(
            logger,
            config,
            scheduler,
            entityTransformation,
          ),
        );
      },
    });
  },
});

// -> 4. Create the backend (this line should already exist).
const backend = createBackend();

// ...
// Other packages are added here.
// ...

// Add the @backstage/plugin-catalog-backend/alpha (this line should already exist).
backend.add(import('@backstage/plugin-catalog-backend/alpha'));

// -> 5. Add our provider to the backend.
backend.add(catalogGlooPlatformPortalBackendProvider);

// -> 6. The backend is started (this line should already exist).
backend.start();
```

3. Update the `app-config.local` file for your backstage instance to include the following values, which should match your authorization server deployment:

```yaml
glooPlatformPortal:
  backend:
    portalServerUrl: http://localhost:31080/v1
    clientId: // Update with your client id
    clientSecret: // Update with your client secret
    tokenEndpoint: // Update with your token endpoint
    // This is optional. The default value is false.
    debugLogging: false
    // This is optional. The default value is 5 minutes.
    syncFrequency:
      hours: 0
      minutes: 1
      seconds: 0
      milliseconds: 0
    // This is optional. The default value is 30 seconds.
    syncTimeout:
      hours: 0
      minutes: 0
      seconds: 10
      milliseconds: 0
```

> &#x26a0;&#xfe0f; For Keycloak users, make sure the OIDC type is set to "confidential" on your client's settings page. On newer Keycloak versions, this is done by checking the "Client authentication" and "Service accounts roles" checkboxes. Older Keycloak versions have an "Access Type" dropdown that should be set to "Confidential", and a "Service Accounts Enabled" toggle button that must be enabled.

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

Then run the Backstage example app, replacing any environment variables as-needed. This example uses `gcr.io/solo-public/docs/portal-backstage-backend:latest`, but you can check the GitHub release versions [here](https://github.com/solo-io/platform-portal-backstage-plugin-backend/releases).

> &#x26a0;&#xfe0f; For an older version of Backstage (prior to v1.27.0), you can use `gcr.io/solo-public/docs/portal-backstage-backend:legacy-backstage-backend`.

```sh
docker run \
--name backstage \
-e PORTAL_SERVER_URL=http://host.docker.internal:31080/v1  # replace \
-e CLIENT_ID= # replace \
-e CLIENT_SECRET= # replace  \
-e PORTAL_DEBUG_LOGGING=true \
-e TOKEN_ENDPOINT=.../realms/master/protocol/openid-connect/token # replace \
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
  backend:
    portalServerUrl: ${PORTAL_SERVER_URL}
    clientId: ${CLIENT_ID}
    clientSecret: ${CLIENT_SECRET}
    tokenEndpoint: ${TOKEN_ENDPOINT}
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
