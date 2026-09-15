FROM node:20-alpine

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY website ./website
COPY assets ./assets
COPY data/articles.json ./data/articles.json
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=4273
EXPOSE 4273

CMD ["node", "server.js"]
