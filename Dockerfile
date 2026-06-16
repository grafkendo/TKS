# Tackticus — Cloud Run / container deploy
#
# Serves the built static client (dist/local/) and the Node WebSocket server.
# No PHP, Apache, or MySQL — see SELF_HOSTING.md for GCP deploy steps.
#
# Cloud Run sets PORT at runtime; server/index.mjs reads process.env.PORT.

FROM node:20-alpine

WORKDIR /app

# Install dependencies (devDeps needed for `vite build`).
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and produce dist/local/
COPY . .
RUN npm run build:all

ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server/index.mjs"]
