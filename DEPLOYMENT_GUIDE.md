# Production Deployment Guide - Deep Research Assistant Backend

## Render Deployment: https://dra-backend-z8sd.onrender.com

### ✅ Issues Fixed

This deployment includes fixes for all production issues:

#### 1. **CORS Configuration** ✅
- **Problem**: Frontend couldn't communicate with backend due to CORS misconfiguration
- **Solution**: 
  - Added `CLIENT_ORIGIN=https://deep-research-assistant-rag.vercel.app` to `.env`
  - Added `BACKEND_URL=https://dra-backend-z8sd.onrender.com` for reference
  - Updated CORS middleware to support multiple origins for development/production
  - Added CSP (Content Security Policy) headers for security

#### 2. **N8N Webhook Connectivity** ✅
- **Problem**: Chat/Upload endpoints returning 404/500 errors when calling N8N webhooks
- **Solution**:
  - Configured environment variables for N8N timeout: `N8N_REQUEST_TIMEOUT=120000` (120s)
  - Added retry logic with exponential backoff (3 retries)
  - Improved error logging to identify where failures occur
  - Added `N8N_MAX_RETRIES=3` for production resilience
  - Fixed header configuration including `X-Request-ID` for tracking

#### 3. **MongoDB ObjectId Casting Issues** ✅
- **Problem**: Frontend sending UUIDs instead of MongoDB ObjectIds, causing 500 errors:
  ```
  CastError: Cast to ObjectId failed for value "3dc7aac0-3821-4cb1-8b31-952dbedf5ec3"
  ```
- **Solution**:
  - Added `validateObjectId` middleware to `/routes/uploadRoutes.js`
  - Added `validateObjectId` middleware to `/routes/chatRoutes.js`
  - Returns clear 400 error with helpful message explaining the ID format issue
  - Logs invalid ID attempts for debugging

#### 4. **Environment Variables & Production Setup** ✅
- **Added to `.env`**:
  ```
  NODE_ENV=production
  N8N_REQUEST_TIMEOUT=120000
  N8N_MAX_RETRIES=3
  BACKEND_URL=https://dra-backend-z8sd.onrender.com
  LOG_LEVEL=info
  ```

---

## Deployment Steps

### 1. **Push Changes to GitHub**
```bash
cd k:\program\Project\dra-backend
git add .
git commit -m "Fix CORS, N8N webhooks, MongoDB ObjectId validation for production"
git push origin main
```

### 2. **Render Auto-Deploy**
Since your GitHub repo is connected to Render:
- Render will automatically detect the push
- Build will start automatically
- Deploy happens once build succeeds
- Check logs at: https://dashboard.render.com

### 3. **Verify Deployment**
```bash
# Test health endpoint
curl https://dra-backend-z8sd.onrender.com/health

# Response should be:
# {
#   "status": "OK",
#   "environment": "production",
#   "uptime": <seconds>
# }
```

---

## Testing the Fixes

### Test 1: CORS Headers
```bash
curl -H "Origin: https://deep-research-assistant-rag.vercel.app" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS https://dra-backend-z8sd.onrender.com/api/v1/chat
```

**Expected**: Should return 200 with CORS headers

### Test 2: Upload with Invalid ID
```bash
curl -X DELETE \
     -H "Authorization: Bearer <YOUR_JWT>" \
     https://dra-backend-z8sd.onrender.com/api/v1/uploads/invalid-uuid-format

# Expected: 400 error with message explaining correct format
```

### Test 3: N8N Webhook Connectivity (Debug Endpoint)
```bash
curl https://dra-backend-z8sd.onrender.com/debug/n8n

# Response shows N8N webhook reachability
```

---

## Environment Variables Checklist

Make sure these are set in Render:

| Variable | Value | Purpose |
|----------|-------|---------|
| `NODE_ENV` | `production` | Enable production mode |
| `PORT` | `5000` | Server port |
| `MONGO_URI` | `mongodb+srv://...` | Database connection |
| `JWT_SECRET` | `<secret>` | Auth token signing |
| `CLIENT_ORIGIN` | `https://deep-research-assistant-rag.vercel.app` | CORS allowed origin |
| `BACKEND_URL` | `https://dra-backend-z8sd.onrender.com` | Backend public URL |
| `N8N_CHAT_WEBHOOK` | `https://kanish08.app.n8n.cloud/webhook/chat` | N8N webhook |
| `N8N_UPLOAD_WEBHOOK` | `https://kanish08.app.n8n.cloud/webhook/upload` | N8N webhook |
| `N8N_REQUEST_TIMEOUT` | `120000` | N8N timeout in ms |
| `N8N_MAX_RETRIES` | `3` | Retry attempts |

---

## Troubleshooting

### Issue: "CORS policy: The value of the 'Access-Control-Allow-Origin' header"
**Solution**: Ensure `CLIENT_ORIGIN` is set correctly in `.env` and deployed to Render

### Issue: N8N Webhook Timeouts (504 errors)
**Solution**: 
- Check if N8N instance is running
- Verify N8N webhooks are active
- Increase `N8N_REQUEST_TIMEOUT` if needed (currently 120s)

### Issue: "Invalid uploadId" errors
**Solution**: 
- Frontend must send valid MongoDB ObjectIds (24-character hex strings)
- Example valid ID: `507f1f77bcf86cd799439011`
- Invalid ID: `3dc7aac0-3821-4cb1-8b31-952dbedf5ec3` (UUID format)

### Issue: 401 "Token expired"
**Solution**: 
- Frontend needs to refresh JWT tokens
- Check auth token expiration in `.env` (currently `JWT_EXPIRE=24h`)

---

## Production Best Practices

1. **Monitor Logs**: Use Render's log viewer
2. **Set Up Alerts**: Configure error notifications
3. **Rate Limiting**: Already enabled for auth (10/hr), chat (5/min), uploads (20/5min)
4. **Security**: 
   - Helmet headers enabled
   - CSP policy configured
   - HTTPS enforced
   - HSTS enabled (1 year)

---

## Rollback Instructions

If deployment has issues:

```bash
# View deployment history
# Go to: https://dashboard.render.com/srv/dra-backend-z8sd/deploys

# Click on previous successful deployment
# Click "Redeploy"
```

---

## Support & Debugging

Check logs for errors:
```bash
# Access Render logs
# ssh into Render instance or use Render dashboard logs
```

Common log patterns:
- ✅ Success: `"n8n chat request successful"`
- ❌ Failed: `"n8n chat service failed after retries"` → Check N8N webhook
- ❌ Failed: `"Invalid ObjectId"` → Check frontend is sending correct ID format

---

## Next Steps

1. ✅ Push code to GitHub
2. ✅ Wait for Render auto-deploy
3. ✅ Test health endpoint
4. ✅ Test CORS from frontend
5. ✅ Monitor logs for errors
6. ✅ Test chat/upload functionality end-to-end

---

**Last Updated**: March 23, 2026
