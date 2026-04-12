# CORS Configuration Deployment Guide

## Overview

The TrustTrade backend uses dynamic CORS configuration to support multiple deployment environments. CORS (Cross-Origin Resource Sharing) controls which frontend domains can make requests to your API.

## Configuration Methods

### 1. **Environment-Based Defaults (Automatic)**

If `CORS_ORIGINS` is not explicitly set, defaults are applied based on the `ENV` variable:

```bash
# Development environment (default)
ENV=development
# Automatically allows: http://localhost:3000, http://localhost:5173, http://127.0.0.1:3000, http://127.0.0.1:5173

# Staging environment
ENV=staging
# Automatically allows: https://staging.trusttradesa.co.za, https://trusttradesa.co.za

# Production environment
ENV=production
# Automatically allows: https://trusttradesa.co.za
```

### 2. **Explicit Configuration (Override)**

Set `CORS_ORIGINS` explicitly to override environment defaults:

```bash
CORS_ORIGINS=https://example.com,https://app.example.com
```

**Important:** Whitespace is automatically stripped, so these are equivalent:
```bash
CORS_ORIGINS=https://example.com,https://app.example.com
CORS_ORIGINS=https://example.com, https://app.example.com
CORS_ORIGINS=https://example.com , https://app.example.com
```

## Deployment Checklist

### Local Development

```bash
ENV=development
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

### Staging Deployment

```bash
ENV=staging
FRONTEND_URL=https://staging.trusttradesa.co.za
CORS_ORIGINS=https://staging.trusttradesa.co.za,https://trusttradesa.co.za
```

### Production Deployment

```bash
ENV=production
FRONTEND_URL=https://trusttradesa.co.za
CORS_ORIGINS=https://trusttradesa.co.za
```

## Common Issues & Fixes

### ❌ Issue: Frontend gets CORS error

**Solution:** Ensure the frontend domain is in `CORS_ORIGINS`

```bash
# Wrong: Backend at api.example.com, frontend at app.example.com
CORS_ORIGINS=https://api.example.com  # ❌ This is the API domain, not frontend

# Correct:
CORS_ORIGINS=https://app.example.com  # ✅ This is the frontend domain
```

### ❌ Issue: Whitespace in CORS_ORIGINS causing issues

**Solution:** The config automatically strips whitespace, but verify your .env file:

```bash
# These all work now:
CORS_ORIGINS=https://example.com,https://app.example.com
CORS_ORIGINS=https://example.com, https://app.example.com  # Extra spaces OK
CORS_ORIGINS=https://example.com , https://app.example.com  # Extra spaces OK
```

### ❌ Issue: All origins needed for testing

**Solution:** Use explicit list instead of wildcard:

```bash
# Old approach (security risk in production):
CORS_ORIGINS=*  

# Better approach (specific origins):
CORS_ORIGINS=https://trusttradesa.co.za,https://staging.trusttradesa.co.za
```

## Environment Variables Reference

```bash
# Required for deployment:
ENV=production                    # development | staging | production
CORS_ORIGINS=https://...         # Comma-separated frontend domains

# Optional (falls back to intelligent defaults):
FRONTEND_URL=https://...         # For email links
```

## Docker/Kubernetes Deployment

When deploying in containers, pass environment variables via:

### Docker

```bash
docker run \
  -e ENV=production \
  -e CORS_ORIGINS=https://trusttradesa.co.za \
  -e MONGO_URL=mongodb://mongo:27017 \
  trusttrade-backend
```

### Docker Compose

```yaml
services:
  backend:
    image: trusttrade-backend:latest
    environment:
      ENV: production
      CORS_ORIGINS: https://trusttradesa.co.za
      MONGO_URL: mongodb://mongo:27017
```

### Kubernetes

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: trusttrade-config
data:
  ENV: production
  CORS_ORIGINS: https://trusttradesa.co.za
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: trusttrade-backend
spec:
  containers:
  - name: backend
    image: trusttrade-backend:latest
    envFrom:
    - configMapRef:
        name: trusttrade-config
    env:
    - name: MONGO_URL
      valueFrom:
        secretKeyRef:
          name: db-credentials
          key: mongo-url
```

## Testing CORS Configuration

### Check current CORS settings

```bash
# Health check includes CORS info
curl -X GET http://localhost:8001/api/health
```

### Test CORS preflight request

```bash
curl -X OPTIONS http://api.example.com/api/health \
  -H "Origin: https://app.example.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v
```

Expected response headers:
```
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Methods: *
Access-Control-Allow-Headers: *
Access-Control-Allow-Credentials: true
```

## Best Practices

1. **Always explicitly set CORS_ORIGINS** - Don't rely on wildcards in production
2. **Use HTTPS** - All production origins must use HTTPS
3. **Separate staging/production** - Never mix staging and production domains
4. **Set ENV variable** - Helps with logging and other environment-aware logic
5. **Document your domains** - Add comments in .env about which frontend domain maps to which origin
6. **Review before deployment** - Double-check CORS_ORIGINS matches your frontend URL

## Related Files

- `.env.example` - Template for environment variables
- `backend/core/config.py` - Configuration parsing logic
- `backend/main.py` - Lines 99-110 - CORS middleware setup