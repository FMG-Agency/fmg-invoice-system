# FMG Invoice & Quotation System

A private, responsive workspace for FMG Agency to manage clients, service categories, invoices, quotations, and generated PDF files.

## Included

- Client directory with reusable contact information
- Category-specific prefixes, counters, and PDF footer copy
- Dynamic invoice and quotation editors with automatic totals
- Branded A4 PDF generation and permanent file storage
- Searchable document archive with preview, download, edit, status, and delete actions
- Dashboard statistics, dark mode, RTL-friendly layout, and mobile navigation
- Cloudflare D1 for relational records and R2 for generated PDFs

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
