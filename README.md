# Distributed Queue Engine

A highly resilient, horizontal background processing orchestration layer backed by Redis and BullMQ, designed to offload heavy I/O workloads from Edge APIs.

## 📖 Deep-Dive Architecture

This repository is part of my Engineering Portfolio. For a complete system design breakdown, including architectural Mermaid.js diagrams, please visit my Developer Portal:

**[Read the System Architecture Article here](https://sudhanshu1402.github.io/system-design-portal/queue-engine)**

## Setup

```bash
npm install
docker-compose up -d
npm run api:dev
# In a new terminal run the worker cluster
npm run worker:dev
```
