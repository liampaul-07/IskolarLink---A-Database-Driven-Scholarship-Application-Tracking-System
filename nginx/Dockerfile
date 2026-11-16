FROM nginx:1.28-alpine

# Our server block replaces the image's default one
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]