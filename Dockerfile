# The Myseed Content Manager as one container: built on the VPS by deploy/vps/deploy.sh (or anywhere with
# `docker build .`). Dev dependencies stay in the image so the backup and restore scripts (tsx) run inside it.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# The release name (deploy.sh) as Next.js's deployment ID: a page left open across a deploy reloads itself instead
# of calling Server Actions that no longer exist.
ARG NEXT_DEPLOYMENT_ID=""
ENV NEXT_DEPLOYMENT_ID=$NEXT_DEPLOYMENT_ID
RUN npm run build
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
