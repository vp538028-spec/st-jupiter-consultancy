# ST Jupiter Consultancy Website

Static doctor jobs and hospital recruitment website.

## Run Locally

```powershell
npm start
```

Open:

```text
http://localhost:3060
```

## Build Dist

```powershell
npm run build
```

Final files are copied to:

```text
dist/
```

## Pages

All HTML files are organized inside:

```text
pages/
```

The server maps `/` to `pages/index.html`.

CRM:

```text
http://localhost:3060/crm
http://localhost:3060/crm-login
```

## Backend

Working APIs:

```text
POST /api/register
POST /api/login
GET  /api/dashboard
POST /api/contact
POST /api/post-job
```
