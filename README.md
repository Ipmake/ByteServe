<p align="center">
  <img src="/assets/banner.png" alt="ByteServe Logo" width="378" height="102">
</p>

# ByteServe - Multi-Threaded File Server & Object Storage Platform

ByteServe is a self-hosted, multi-user, **multi-threaded** file server and object storage platform featuring a modern web interface, S3-compatible API, and WebDAV support.

<p align="center">
  <img src="/assets/screenshot1.png" alt="ByteServe Dashboard" width="800">
  <br/>
  <em>Screenshot (16:9)</em>
</p>

---

## Overview

This project provides a comprehensive solution for managing digital assets. Users can create **storage "buckets,"** upload/organize files and folders, manage access permissions, and interact with their data via multiple protocols (Web UI, API, S3, WebDAV). The backend utilizes Node.js (Express), TypeScript, Prisma ORM with PostgreSQL, and leverages **Worker threads for multi-threaded background task processing**. The frontend is a React SPA built with Vite and Material UI.

---

## Features

* **Multi-User Management:** Supports multiple users with individual accounts and quotas.
* **Bucket Management:** Create, manage, and delete storage buckets with configurable access levels (**private, public-read, public-write**) and storage quotas.
* **File & Folder Management:** Hierarchical structure within buckets. Upload, download, rename, move, delete files and folders via the web UI.
* **Protocol Support:**
    * **S3-Compatible API:** Programmatic access using S3 tools and SDKs.
    * **WebDAV:** Mount buckets as network drives or use WebDAV clients.
* **Multi-Threading:** Utilizes worker threads for efficient background task processing (e.g. heavy file operations), enhancing performance and scalability.
* **Scheduled Tasks:** Built-in scheduler for tasks like purging old objects/tokens, reporting stats, and SSL renewal.
* **Configuration Management:** System-wide settings managed via the database and accessible through an admin UI.
* **Statistics & Monitoring:** Tracks storage usage, requests served, and other metrics per bucket and globally.
* **Modern Web UI:** React SPA with Material UI for a responsive user experience.
* **Security:** Password hashing (client-side SHA256 before sending), separate credentials for API/protocols, CORS, and SSL support.
* **Automatic SSL:** Built-in support for automatic SSL certificate generation and renewal via Let's Encrypt.
* **File Requests:** Temporary, secure file request upload commands for windows & Linux to allow external users to upload files to specific buckets without needing an account.

---

## Setup Instructions

**Prerequisites:**

* Docker and Docker Compose
* PostgreSQL Server (if not using Docker)
* Redis-Stack Server (if not using Docker)

**Using Docker Compose (Recommended):**

```yaml
services:
  postgres:
    image: postgres:17.6
    command:
      - postgres
      - '-c'
      - wal_level=logical
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: VerySecure
      POSTGRES_DB: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis/redis-stack-server:latest
    environment:
      - REDIS_ARGS="--requirepass VerySecure"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  byteserve:
    image: ghcr.io/ipmake/byteserve:latest
    restart: on-failure:5
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      - DATABASE_URL=postgresql://postgres:VerySecure@postgres:5432/postgres
      - REDIS_URL=redis://default:VerySecure@redis:6379
    volumes:
      - ./data/storage:/app/storage
      - /tmp/byteserve_temp:/app/storage/.temp
      - byteserve_config:/app/data

volumes:
  postgres_data:
  byteserve_config:
```

---

## Running the Application

**Using Docker Compose:**

* Start: `docker compose up -d`
* Stop: `docker compose down`
* Logs: `docker compose logs -f byteserve`