# FreeResources — web app + acquisition worker share this image.
# SQLite (WAL) and the acquired document store must live on a persistent volume.
FROM node:22-bookworm-slim

# Ghostscript powers the PDF optimisation stage. Without it the pipeline reports
# "unavailable" and keeps the original as the serving version.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ghostscript ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3100
EXPOSE 3100

# Overridden by docker-compose for the worker service.
CMD ["npm", "run", "start", "--", "-p", "3100"]
