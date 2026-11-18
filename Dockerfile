FROM node:26-alpine AS build
WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases ./.yarn/releases
RUN node .yarn/releases/yarn-*.cjs install --immutable
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN node .yarn/releases/yarn-*.cjs build \
  && node .yarn/releases/yarn-*.cjs workspaces focus --production

FROM node:26-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/main.js"]
