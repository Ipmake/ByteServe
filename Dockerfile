# Stage 1: Build everything
FROM node:24 AS builder
WORKDIR /app
# Copy root configuration
COPY package*.json tsconfig.json ./
# Copy all packages
COPY packages ./packages
# Install all dependencies at root
RUN npm install
# Build shared types first
WORKDIR /app/packages/shared
RUN npm run build
# Build frontend
WORKDIR /app/packages/frontend
RUN npm run build
# Copy built frontend into backend's www folder
RUN cp -r /app/packages/frontend/dist /app/packages/backend/www

# Stage 2: Production image
FROM node:24-slim
WORKDIR /app
# Copy backend with built frontend
COPY --from=builder /app/packages/backend ./
# Copy shared package
COPY --from=builder /app/packages/shared ../shared
# Install production dependencies for backend
RUN apt-get update && apt-get install -y openssl
# Install only production dependencies
RUN npm install --omit=dev
# Copy Prisma files
COPY packages/backend/prisma ./prisma
# Create entrypoint script
RUN echo '#!/bin/sh\n\
npx prisma db push\n\
exec npm start' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh
ENV NODE_ENV=production
EXPOSE 80
EXPOSE 443
ENTRYPOINT ["/app/entrypoint.sh"]