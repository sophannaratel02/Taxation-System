# Axis Investment Consulting Tax System

A Vue 3 ERP-style frontend for accounting, tax filing, sales, inventory, and staff operations for Axis Investment Consulting.

## Overview

This frontend connects to the backend API and provides the business operations interface for:

- employee and admin access
- sales and POS workflows
- inventory and stock adjustments
- purchase and vendor management
- tax declaration and annual filing
- reporting and approval flows

## Prerequisites

- Node.js 22+
- npm
- a running backend instance on port 4000 or a configured API URL

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

The dev server runs on the Vite default port, usually `http://localhost:5173`.

## Production build

```bash
npm run build
```

The built files are output to `dist/` and should be served behind a web server with SPA fallback enabled.

## Environment configuration

Create a `.env` file in `Tax-frontend` when the API is not hosted at the same origin:

```env
VITE_API_URL=http://localhost:4000/api
```

## Deployment notes

- serve `dist/` as the website root
- proxy `/api` to the backend service
- preserve the `/api` prefix for the backend routes
- enable SPA fallback for routes such as `/login` and `/dashboard`
- set the backend `CORS_ORIGIN` to the production frontend domain

## Brand and UX notes

The interface is designed to match a professional tax and inventory ERP look:

- dark navy branding
- gold accent highlights
- modern dashboard cards
- responsive sidebar and topbar layouts
- clean accounting/reporting presentation

## Related project files

- backend: `Tax-backend/`
- API docs: `Tax-backend/README.md`
