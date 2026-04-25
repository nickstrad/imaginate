# You can use most Debian-based base images
FROM node:24-slim

# Install curl
RUN apt-get update && apt-get install -y curl && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY compile_page.sh /compile_page.sh
RUN chmod +x /compile_page.sh

# Install dependencies and customize sandbox.
# Installing nextjs needs to be done in an empty directory.
WORKDIR /home/user/nextjs-app

RUN npx --yes create-next-app@16.2.4 . --yes

RUN npx --yes shadcn@4.4.0 init --yes --defaults --force
RUN npx --yes shadcn@4.4.0 add --all --yes

# Move the Next.js app to the runtime home directory.
RUN mv /home/user/nextjs-app/* /home/user/

# Keep the original build workdir available for E2B v2 configuration steps.
RUN mkdir -p /home/user/nextjs-app

WORKDIR /home/user
