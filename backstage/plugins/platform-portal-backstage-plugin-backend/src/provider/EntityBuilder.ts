import { Entity, EntityMeta } from '@backstage/catalog-model';
import { EntityProviderMutation } from '@backstage/plugin-catalog-node';
import { APISchema } from './api-types';
import { sanitizeStringForEntity } from './utility';

export class EntityBuilder {
  // Backstage catalog metadata.
  private bsGroupName = 'solo-io-service-accounts';
  private bsServiceAccountName = 'gloo-platform-portal-service-account';
  private bsSystemName = 'gloo-platform-portal-apis';

  private apisEndpoint = '';
  private portalServerUrl = '';

  onApisEndpointChange = (apisEndpoint: string) =>
    (this.apisEndpoint = apisEndpoint);
  onPortalServerUrlChange = (portalServerUrl: string) =>
    (this.portalServerUrl = portalServerUrl);

  /**
   * A helper function to return a Backstage catalog entity for an API.
   */
  buildApiVersionEntity(
    apiId: string,
    apiVersion: string | undefined,
    apiDescription: string,
    schema: APISchema | string | undefined,
  ): Entity {
    const newEntity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'API',
      metadata: {
        tags: [
          'gloo-platform',
          ...(!!apiVersion
            ? ['api-version:' + sanitizeStringForEntity('tag', apiVersion)]
            : []),
        ],
        name: sanitizeStringForEntity('name', apiId),
        title: apiId,
        description: apiDescription,
        annotations: {
          'backstage.io/managed-by-location': `url:${this.apisEndpoint}`,
          'backstage.io/managed-by-origin-location': `url:${this.apisEndpoint}`,
        },
      } as EntityMeta,
      spec: {
        type: 'openapi',
        lifecycle: 'production',
        system: this.bsSystemName,
        owner: `user:${this.bsServiceAccountName}`,
        definition: JSON.stringify(schema),
      },
    };
    return newEntity;
  }

  /**
   * A helper function to return a Backstage catalog EntityProviderMutation object for the GlooPlatformPortalProvider plugin.
   * The returned object includes entities that will be added to the catalog.
   */
  buildEntityProviderMutation(entities: Entity[]) {
    const locationKey = `gloo-platform-portal-provider`;
    const mutationObj: EntityProviderMutation = {
      type: 'full',
      entities: [
        {
          locationKey,
          entity: {
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'Group',
            metadata: {
              name: this.bsGroupName,
              annotations: {
                'backstage.io/managed-by-location': `url:${this.portalServerUrl}`,
                'backstage.io/managed-by-origin-location': `url:${this.portalServerUrl}`,
              },
            },
            spec: {
              type: 'service-account-group',
              children: [],
              members: [this.bsServiceAccountName],
            },
          },
        },
        {
          locationKey,
          entity: {
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'User',
            metadata: {
              name: this.bsServiceAccountName,
              annotations: {
                'backstage.io/managed-by-location': `url:${this.portalServerUrl}`,
                'backstage.io/managed-by-origin-location': `url:${this.portalServerUrl}`,
              },
            },
            spec: {
              displayName: 'Solo.io Service Account',
              email: '',
              picture: '',
              memberOf: [this.bsGroupName],
            },
          },
        },
        // {
        //   locationKey,
        //   entity: {
        //     apiVersion: 'backstage.io/v1alpha1',
        //     kind: 'Domain',
        //     metadata: {
        //       tags: ['gloo-platform'],
        //       name: 'api-product',
        //       description: 'Gloo Platform Portal ApiProduct resources.',
        //       annotations: {
        //         'backstage.io/managed-by-location': 'url:' + this.apisEndpoint,
        //         'backstage.io/managed-by-origin-location':
        //           'url:' + this.apisEndpoint,
        //       },
        //     } as EntityMeta,
        //     spec: {
        //       owner: 'user:' + bsServiceAccountName,
        //     },
        //   },
        // },
        {
          locationKey,
          entity: {
            apiVersion: 'backstage.io/v1alpha1',
            kind: 'System',
            metadata: {
              tags: ['gloo-platform'],
              name: this.bsSystemName,
              title: 'Gloo Platform Portal APIs',
              annotations: {
                'backstage.io/managed-by-location': `url:${this.portalServerUrl}`,
                'backstage.io/managed-by-origin-location': `url:${this.portalServerUrl}`,
              },
            } as EntityMeta,
            spec: {
              owner: `user:${this.bsServiceAccountName}`,
              // domain: 'api-product',
            },
          },
        },
        ...entities.map(entity => ({ locationKey, entity })),
      ],
    };
    return mutationObj;
  }
}
