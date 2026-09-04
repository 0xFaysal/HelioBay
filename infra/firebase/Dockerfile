FROM node:22.14-alpine
RUN apk add --no-cache openjdk21-jre-headless wget && npm install --global firebase-tools@14.12.1 && npm cache clean --force
WORKDIR /app
COPY firebase.json .firebaserc entrypoint.sh ./
RUN chmod +x /app/entrypoint.sh
EXPOSE 9099 4400
ENTRYPOINT ["/app/entrypoint.sh"]
