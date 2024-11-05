/*
 * Hi!
 *
 * Note that this is an EXAMPLE Backstage backend. Please check the README.
 *
 * Happy hacking!
 */

import { createBackend } from '@backstage/backend-defaults';

import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { Entity } from '@backstage/catalog-model';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node/alpha';
import { API, ApiVersion, GlooPlatformPortalProvider } from '@solo.io/platform-portal-backstage-plugin-backend';

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
};

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

const backend = createBackend();

backend.add(import('@backstage/plugin-app-backend/alpha'));
backend.add(import('@backstage/plugin-proxy-backend/alpha'));
backend.add(import('@backstage/plugin-scaffolder-backend/alpha'));
backend.add(import('@backstage/plugin-techdocs-backend/alpha'));

// auth plugin
backend.add(import('@backstage/plugin-auth-backend'));
// See https://backstage.io/docs/backend-system/building-backends/migrating#the-auth-plugin
backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));
// See https://backstage.io/docs/auth/guest/provider

// catalog plugin
backend.add(import('@backstage/plugin-catalog-backend/alpha'));
backend.add(
  import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'),
);

// permission plugin
backend.add(import('@backstage/plugin-permission-backend/alpha'));
backend.add(
  import('@backstage/plugin-permission-backend-module-allow-all-policy'),
);

// search plugin
backend.add(import('@backstage/plugin-search-backend/alpha'));
backend.add(import('@backstage/plugin-search-backend-module-catalog/alpha'));
backend.add(import('@backstage/plugin-search-backend-module-techdocs/alpha'));

// custom plugins
backend.add(catalogGlooPlatformPortalBackendProvider);

backend.start();
