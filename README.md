# [Backstage](https://backstage.io) With Gloo Platform Portal

This is a Backstage App with the Gloo Platform Portal backend plugin installed. This plugin is located in the `./plugins/platform-portal-backstage-plugin-backend` folder. See the Readme in that folder for more information.

To start the app, run:

```sh
yarn install
yarn dev
```

## Creating Releases

When making a new release, use the GitHub UI, and name your release in the format: `v1.2.3`. When the release is published, a new branch will be made (`v1.2.x`), and that version of (@solo.io/platform-portal-backstage-plugin-backend)[https://www.npmjs.com/package/@solo.io/platform-portal-backstage-plugin-backend] will be published to NPM.

## Updating GitHub Workflow Secrets

Under "Settings" -> "Secrets and variables" -> "Actions", there is an `NPM_ACCESS_TOKEN` that needs to be updated every year (since that is the maximum an NPM access token can be valid for). This token can be generated from account settings on (NPM)[https://www.npmjs.com/] for users that have access to the @solo.io NPM organization.
