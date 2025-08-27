# Intent Engine API with Swagger Documentation

# ---- Builder Stage ----
# This stage installs production dependencies
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

# ---- Final Stage ----
# This stage creates the final image
FROM node:18-alpine

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S intentengine -u 1001

WORKDIR /app

# Copy package files first for proper dependency resolution
COPY --chown=intentengine:nodejs package*.json ./

# Copy dependencies from builder stage
COPY --from=builder --chown=intentengine:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=intentengine:nodejs . .

# Switch to non-root user
USER intentengine

# Expose the port
EXPOSE 3002

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD [ "node", "-e", "require(\"http\").get(\"http://localhost:3002/health\", (res) => process.exit(res.statusCode == 200 ? 0 : 1)).on('error', () => process.exit(1))" ]

# Environment variables
ENV NODE_ENV=production
ENV PORT=3002

# Start the application
CMD ["npm", "start"]

# Labels for better container management
LABEL maintainer="Zap Pilot"
LABEL description="Intent Engine API with integrated Swagger documentation"
LABEL version="1.0.0"
LABEL org.opencontainers.image.source="https://github.com/all-weather-protocol/intent-engine"