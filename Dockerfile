FROM node:22-slim

# Install OpenSSL for Prisma and CA certificates
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace package definitions
COPY nirvan-settlement/package*.json ./
COPY nirvan-settlement/packages/rules/package*.json ./packages/rules/
COPY nirvan-settlement/apps/api/package*.json ./apps/api/
COPY nirvan-settlement/apps/web/package*.json ./apps/web/

# Install dependencies
RUN npm install

# Copy application source code
COPY nirvan-settlement/ ./

# Generate Prisma Client
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Push schema, seed admin user from APPROVER_EMAILS, and start server
CMD ["npm", "start"]
