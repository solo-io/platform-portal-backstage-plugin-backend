# This dockerfile builds an image for the backend package.
# It should be executed with the root of the repo as docker context.
#
# Before building this image, be sure to have run the following commands in the repo root:
#
# yarn install --immutable
# yarn tsc
# yarn build:backend
#
# Once the commands have been run, you can build the image using `yarn build-image`
#
# Two stages, because `yarn workspaces focus` compiles better-sqlite3 and isolated-vm and
# so needs python3, g++, build-essential and libsqlite3-dev. Those exist to produce
# node_modules and are no use once it exists, but a single-stage build cannot put them
# down again — they and everything they pull in stay in the shipped image, where a scanner
# counts every one of them. Here they live in a stage that is thrown away, and only
# node_modules crosses over.

FROM node:24.20.0-trixie-slim AS deps

# Set Python interpreter for `node-gyp` to use
ENV PYTHON=/usr/bin/python3

# Install isolate-vm dependencies, these are needed by the @backstage/plugin-scaffolder-backend.
# Plus the sqlite3 headers better-sqlite3 builds against.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends python3 g++ build-essential libsqlite3-dev && \
    rm -rf /var/lib/apt/lists/*

USER node
WORKDIR /app

ENV NODE_ENV=production

# Copy files needed by Yarn
COPY --chown=node:node .yarn ./.yarn
COPY --chown=node:node .yarnrc.yml ./

# The skeleton contains the package.json of each package in the monorepo, and along with
# yarn.lock and the root package.json, that's enough to run yarn install.
COPY --chown=node:node yarn.lock package.json packages/backend/dist/skeleton.tar.gz ./
RUN tar xzf skeleton.tar.gz && rm skeleton.tar.gz

RUN --mount=type=cache,target=/home/node/.cache/yarn,sharing=locked,uid=1000,gid=1000 \
    yarn workspaces focus --all --production && rm -rf "$(yarn cache clean)"

# Wolfi runtime: glibc, so the native modules built in the Debian stage above still load.
FROM cgr.dev/chainguard/wolfi-base:latest@sha256:08df5982c3d27e70a4ce1607e3bb9af09d746f8722cf135a7694afef879fc5a2

# Exact versions, so a rebuild of the same commit gets the same packages.
RUN apk add --no-cache \
      nodejs-24=24.21.0-r3 \
      c-ares=1.34.8-r2 \
      icu78-data-full=78.3-r3 \
      libicu78=78.3-r3 \
      libnghttp2-14=1.70.0-r4 \
      libstdc++=16.2.0-r1 \
      libuv=1.53.0-r0 && \
    adduser -D -u 1000 node

# From here on we use the least-privileged `node` user to run the backend.
USER node

# This should create the app dir as `node`.
# If it is instead created as `root` then the `tar` command below will fail: `can't create directory 'packages/': Permission denied`.
# If this occurs, then ensure BuildKit is enabled (`DOCKER_BUILDKIT=1`) so the app dir is correctly created as `node`.
WORKDIR /app

# This switches many Node.js dependencies to production mode.
ENV NODE_ENV=production

# This disables node snapshot for Node 20 to work with the Scaffolder
ENV NODE_OPTIONS="--no-node-snapshot"

COPY --chown=node:node backstage.json ./

# The same skeleton, so the workspace package.json layout node resolves against is here
# too. Extracted rather than copied from the stage above, so this stage does not depend on
# which directories that one happened to create.
COPY --chown=node:node yarn.lock package.json packages/backend/dist/skeleton.tar.gz ./
RUN tar xzf skeleton.tar.gz && rm skeleton.tar.gz

# The one thing worth carrying over. No yarn here: the backend is started with `node`, and
# nodeLinker is node-modules, so nothing resolves through a Yarn runtime.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules

# This will include the examples, if you don't need these simply remove this line
COPY --chown=node:node examples ./examples

# Then copy the rest of the backend bundle, along with any other files we might want.
COPY --chown=node:node packages/backend/dist/bundle.tar.gz app-config*.yaml ./
RUN tar xzf bundle.tar.gz && rm bundle.tar.gz

CMD ["node", "packages/backend", "--config", "app-config.yaml", "--config", "app-config.production.yaml"]
