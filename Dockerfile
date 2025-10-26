# Stage 1: Build frontend
FROM node:24 AS frontend-build
WORKDIR /packages/frontend
COPY packages/frontend/package*.json ./
RUN npm install
COPY packages/frontend/ .
RUN npm run build

# Stage 2: Build backend
FROM node:24 AS backend-build
WORKDIR /packages/backend
COPY packages/backend/package*.json ./
RUN npm install
COPY packages/backend/ .
# Copy built frontend into backend's www folder
COPY --from=frontend-build /packages/frontend/dist ./www

# Stage 3: Production image
FROM node:24-slim
WORKDIR /app
COPY --from=backend-build /packages/backend ./
# Install only production dependencies
RUN npm install --omit=dev

# Copy Prisma files if needed
COPY /packages/backend/prisma ./prisma

# Create entrypoint script
RUN echo '#!/bin/sh\n\
npx prisma db push\n\
exec npm start' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

ENV NODE_ENV=production

EXPOSE 80
EXPOSE 443
ENTRYPOINT ["/app/entrypoint.sh"]