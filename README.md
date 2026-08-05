# FMG Invoice & Quotation System

A private, responsive workspace for FMG Agency to manage clients, service categories, invoices, quotations, and generated PDF files.

## Included

- Client directory with reusable contact information
- Category-specific prefixes, counters, and PDF footer copy
- Dynamic invoice and quotation editors with automatic totals
- Branded A4 PDF generation and permanent file storage
- Searchable document archive with preview, download, edit, status, and delete actions
- First-run administrator setup with a protected username and password
- In-app credential changes, secure sign-out, rate limiting, and encrypted password hashing
- Dashboard statistics, dark mode, RTL-friendly layout, and mobile navigation
- Turso Cloud for relational records and private Vercel Blob storage for generated PDFs

## Vercel deployment

The production deployment uses the standard Next.js runtime on Vercel. Connect a Turso Cloud database and a private Vercel Blob store so Vercel supplies `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `BLOB_READ_WRITE_TOKEN`.

## Local development

```bash
npm install
npm run dev
```

## Validation

```bash
npm run db:generate
npm run build
npm test
```
