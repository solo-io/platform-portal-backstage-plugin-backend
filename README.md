# Gloo Platform Portal: Backstage Backend Plugin

This is a plugin for Backstage. The plugin is located in `./backstage/plugins/platform-portal-backstage-plugin-backend`. See the Readme file there for more information.

The rest of this repo is based on the project created by `npx @backstage/create-app@latest`.

So for updating dependencies:

- The `./backstage` folder should be renamed to `./backstage-old`
- `npx @backstage/create-app@latest` can be run to create a new project in a new `./backstage` folder.
- The `./backstage/plugins/platform-portal-backstage-plugin-backend` folder can be moved to the new project.
- `yarn tsc` can be run in the `./backstage` project to generate the types. You may need to build the project.
- The `./backstage/packages/backend` project can be updated to include the plugin.
- The `app-config.local.yaml` file should be migrated.
- The `app-config.yaml` file should be updated to include the YAML from the readme.
- The `./backstage-old` folder can be deleted.

```
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

# Ensure the `resolutions` in all `package.json` files remain
# This needs to be done manually

cd backstage
yarn install

rm -rf ./backstage-old
```

Then to test base functionality:

- Make sure that postgres is running as per the Readme instructions.
- Have Keycloak running on http://localhost:8088 with a client that has "Client Authentication" and "Service Accounts Roles" enabled.
- Have the correct client ID and secret in your `app-config.yaml`.
- Run the `./backstage` project with `yarn start`
- Verify that the `info gloo-platform-portal:` logs show that the plugin has started, got the token, and is using it to try and fetch APIs. This is how we know that it will still work.

Then for the release:

- Merge the PR into main.
- Kick off a GitHub release on the repository.
- Verify that the image is built, deployed, and the NPM package published.
