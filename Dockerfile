FROM node:20-alpine

WORKDIR /app/server

# Copy package files first for better layer caching.
COPY server/package*.json ./

# Install all dependencies for the TypeScript build.
RUN npm ci

# Copy server source and config.
COPY server/src ./src
COPY server/tsconfig.json ./

# Copy frontend assets that are served from the repo root.
COPY index.html /app/index.html
COPY client /app/client

# Build TypeScript.
RUN npm run build

# Remove dev dependencies for the runtime image.
RUN npm ci --omit=dev

EXPOSE 3000

CMD ["npm", "start"]
