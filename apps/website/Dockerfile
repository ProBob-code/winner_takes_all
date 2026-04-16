FROM node:20-slim

WORKDIR /app

# Copy the entire monorepo to handle workspace dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/website ./apps/website

# Install pnpm and dependencies
RUN npm install -g pnpm && pnpm install

# Expose the website port
EXPOSE 3001

# Start the website
CMD ["pnpm", "--filter", "website", "dev", "--host"]
