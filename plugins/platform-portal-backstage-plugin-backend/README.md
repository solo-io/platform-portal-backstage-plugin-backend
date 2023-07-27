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
  // This is optional, defaults to 5 minutes.
  syncFrequency:
    hours: 0
    minutes: 1
    seconds: 0
    milliseconds: 0
  // This is optional, defaults to 30 seconds.
  syncTimeout:
    hours: 0
    minutes: 0
    seconds: 10
    milliseconds: 0
```
