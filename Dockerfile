# campusDash backend. Railway (and any Docker host) builds this instead of Railpack.
FROM node:24-alpine

WORKDIR /app

# Install dependencies first so this layer is cached between deploys
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Same check as `npm run build`: the deploy fails if any test fails
RUN npm test

ENV NODE_ENV=production

# Railway sets PORT; the server reads it. Keys come from Railway's Variables, not a .env file.
CMD ["node", "src/server.js"]
