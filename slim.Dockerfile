FROM oven/bun:latest

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY slim-bunfig.toml ./bunfig.toml

# Install dependencies
RUN bun install

# install needed libraries for full liteparse functionalities
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips42 \
    ca-certificates \
    libreoffice \
    default-jre-headless \
    imagemagick \
    tesseract-ocr \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

# Copy source code
COPY . .

EXPOSE 5000

CMD ["bun", "run", "start-slim:bun"]
