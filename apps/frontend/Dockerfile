FROM node:20-slim

WORKDIR /app

# Copy the entire monorepo to handle workspace dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web

# Install pnpm and dependencies
RUN npm install -g pnpm && pnpm install

# Expose the web port
EXPOSE 3000
# Start the web app in dev mode
CMD ["pnpm", "--filter", "web", "dev"]
