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
# /app crosses over.

FROM node:24.22.1-trixie-slim AS deps

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

# The runtime image has no shell or tar, so the bundle is unpacked here.
COPY --chown=node:node backstage.json ./
COPY --chown=node:node packages/backend/dist/bundle.tar.gz app-config*.yaml ./
RUN tar xzf bundle.tar.gz && rm bundle.tar.gz
COPY --chown=node:node examples ./examples

# Distroless Node 24 on Debian 13: same glibc as the stage above, so the native modules load.
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:b8cec4b2f2126ff7bd034ec9ac207ffb3272667dfdc48376e3b035d3270549ba

WORKDIR /app

ENV NODE_ENV=production

# This disables node snapshot for the Scaffolder.
ENV NODE_OPTIONS="--no-node-snapshot"

# 65532 is the image's nonroot user. The entrypoint is `node`, so CMD is its arguments.
COPY --from=deps --chown=65532:65532 /app ./

CMD ["packages/backend", "--config", "app-config.yaml", "--config", "app-config.production.yaml"]
