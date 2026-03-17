# Pin exact version — actualizar SHA despues de instalar Docker:
# docker inspect node:20.19.0-alpine --format='{{index .RepoDigests 0}}'
FROM node:20.19.0-alpine

# Usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY src/ ./src/

RUN mkdir -p /app/data && chown -R nodejs:nodejs /app

USER nodejs

ENV NODE_ENV=production
ENV TZ=America/Hermosillo

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "src/index.js"]
