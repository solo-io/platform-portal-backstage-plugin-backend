import { CatalogBuilder } from '@backstage/plugin-catalog-backend';
import { ScaffolderEntitiesProcessor } from '@backstage/plugin-scaffolder-backend';
import { Router } from 'express';
import { PluginEnvironment } from '../types';

import { GlooPlatformPortalProvider } from '@solo.io/platform-portal-backstage-plugin-backend';

export default async function createPlugin(
  env: PluginEnvironment,
): Promise<Router> {
  const builder = await CatalogBuilder.create(env);
  builder.addProcessor(new ScaffolderEntitiesProcessor());

  const gppp = new GlooPlatformPortalProvider(
    'production',
    env.logger,
    env.config,
  );
  builder.addEntityProvider(gppp);

  const { processingEngine, router } = await builder.build();
  await processingEngine.start();

  await env.scheduler.scheduleTask({
    id: 'run_gloo_platform_portal_refresh',
    fn: async () => {
      await gppp.run();
    },
    frequency: { minutes: 1 },
    timeout: { seconds: 30 },
  });

  return router;
}
