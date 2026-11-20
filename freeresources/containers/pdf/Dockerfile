# FreeResources PDF processing container.
#
# Provides the native binaries that Cloudflare Workers cannot run: Ghostscript
# for compression and qpdf for structural validation. The service is stateless —
# bytes in, structured metadata plus an optional compressed PDF out.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ghostscript \
      qpdf \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.mjs ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Cloudflare Containers health-checks the port before routing traffic.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
