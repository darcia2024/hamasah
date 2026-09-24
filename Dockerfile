FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Dependency dipasang lebih dulu supaya layer ini bisa dipakai ulang saat kode berubah.
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node server.js ./
COPY --chown=node:node server ./server
COPY --chown=node:node database ./database
COPY --chown=node:node website ./website
COPY --chown=node:node assets ./assets
COPY --chown=node:node data/articles.json ./data/articles.json
# Worker dijalankan dari image yang sama (scheduler/cron platform): notifikasi dan pengingat visa.
COPY --chown=node:node scripts/notification-worker.js scripts/visa-reminder-worker.js ./scripts/

USER node
ENV PORT=4273
EXPOSE 4273

# /api/health hanya memeriksa proses. Kesehatan database diperiksa lewat /api/ready
# supaya gangguan database tidak membuat container terus dimatikan dan dihidupkan ulang.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["node", "server.js"]
