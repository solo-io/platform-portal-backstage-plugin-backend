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
# Plus the sqlite3 headers better-sqlite3 builds against; the runtime stage needs only the
# library, which its pinned upgrade below already installs.
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

FROM node:24.20.0-trixie-slim

# Upgrade OS packages with known CVEs
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends \
      dpkg=1.22.22 \
      libc-bin=2.41-12+deb13u3 \
      libc6=2.41-12+deb13u3 \
      libcap2=1:2.75-10+deb13u1+b1 \
      libsqlite3-0=3.46.1-7+deb13u1 \
      libsystemd0=257.13-1~deb13u1 \
      libudev1=257.13-1~deb13u1 \
      sed=4.9-2+deb13u1 && \
    rm -rf /var/lib/apt/lists/*

# Remove the npm that ships inside the base image. Its bundled dependencies are
# the only fixable CRITICAL/HIGH CVEs left in this image — brace-expansion 5.0.7
# (CVE-2026-14257, CVE-2026-69152), ip-address 10.2.0 (CVE-2026-69192) and tar
# 7.5.19 (CVE-2026-73566) — and they cannot be cleared any other way:
#
#   - No newer base image tag helps: 24.20.0 is the latest trixie-slim tag and
#     still bundles npm 11.19.0 with all four.
#   - `npm install -g npm@latest` does not clear them either, and would pull a
#     second npm tree into the image just to patch one we do not use.
#
# Nothing here needs npm. This image builds with yarn (the base image provides
# it from /opt/yarn-v1.22.22, outside npm's tree), corepack is a separate
# package, the backend is started directly with `node`, and the base image's
# docker-entrypoint.sh only shells out to `node`.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

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
