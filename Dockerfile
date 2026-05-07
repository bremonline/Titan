FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY server/package*.json ./

# Install dependencies (production only)
RUN npm ci --omit=dev

# Copy source
COPY server/src ./src
COPY server/tsconfig.json ./

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3000

# Start server
CMD ["npm", "start"]
