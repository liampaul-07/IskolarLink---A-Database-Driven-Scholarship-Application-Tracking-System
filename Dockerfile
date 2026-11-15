FROM node:20-slim

WORKDIR /app

# Install dependencies first so Docker can reuse this layer
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest of the project
COPY . .

ENV NODE_ENV=production
EXPOSE 3000

# Run as the unprivileged "node" user, not root
USER node

CMD ["node", "server/server.js"]