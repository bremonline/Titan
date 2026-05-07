FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY server/package*.json ./

# Install ALL dependencies (including dev for build)
RUN npm ci

# Copy source
COPY server/src ./src
COPY server/tsconfig.json ./

# Build TypeScript
RUN npm run build

# Remove dev dependencies for smaller image
RUN npm ci --omit=dev

# Expose port
EXPOSE 3000

# Start server
CMD ["npm", "start"]
