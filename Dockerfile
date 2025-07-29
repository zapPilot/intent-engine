# Intent Engine API with Swagger Documentation
# Multi-stage build for optimized production image

# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci --include=dev

# Copy source code 
COPY . .

# Run lint only on src/ (tests should be run in CI/CD pipeline, not in Docker build)
RUN npx eslint src/ --ext .js

# Production stage
FROM node:18-alpine AS production

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S intentengine -u 1001

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

# Copy application code from builder stage
COPY --from=builder --chown=intentengine:nodejs /app/src ./src
COPY --from=builder --chown=intentengine:nodejs /app/server.js ./
COPY --from=builder --chown=intentengine:nodejs /app/docs ./docs

# Switch to non-root user
USER intentengine

# Expose the port
EXPOSE 3002

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3002/health', (res) => { \
        process.exit(res.statusCode === 200 ? 0 : 1) \
    }).on('error', () => process.exit(1))"

# Environment variables
ENV NODE_ENV=production
ENV PORT=3002

# Start the application
CMD ["npm", "start"]

# Labels for better container management
LABEL maintainer="All Weather Protocol"
LABEL description="Intent Engine API with integrated Swagger documentation"
LABEL version="1.0.0"
LABEL org.opencontainers.image.source="https://github.com/all-weather-protocol/intent-engine"
