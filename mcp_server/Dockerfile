FROM node:24-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs authority_contract.json ./
COPY data/records.seed.json ./data/records.seed.json

RUN mkdir -p /data && chown -R node:node /app /data
USER node

ENV PORT=8765
ENV STATE_PATH=/data/records.json
EXPOSE 8765

CMD ["node", "server.mjs"]
