# Deployment Guide

## Overview

The EEG Platform supports multiple deployment configurations, from simple static hosting to hybrid setups with backend services.

### Latest validation (Dec 2025)
- Next.js upgraded to **15.5.5/15.5.7** (resolves Vercel vulnerable Next.js notice).
- Local validation commands (all pass):
  - `npm run type-check`
  - `npm run lint` (warnings only, no errors; hook deps/img suggestions intentionally left as-is)
  - `npm test`
  - `npm run build`
- Pre-deploy helper: `npm run validate` (wraps type-check + build).

---

## Deployment Options

### Option 1: Browser Python Mode Only (Recommended)

**Best for:** Maximum privacy, zero server costs, simple deployment

#### Architecture
- Frontend only (Next.js)
- Pyodide loaded from CDN
- No backend required

#### Deployment Steps

##### 1. Build the Application

```bash
# Install dependencies
npm install

# Build for production
npm run build
```

##### 2. Deploy to Vercel (Recommended)

**Vercel is the recommended hosting platform for Next.js applications.**

1. **Install Vercel CLI** (optional)
   ```bash
   npm i -g vercel
   ```

2. **Deploy**
   ```bash
   vercel
   ```
   Follow the prompts to link your project.

3. **Automatic Deployments**
   - Connect your Git repository to Vercel
   - Automatic deployments on push to main branch
   - Preview deployments for pull requests

**Vercel Configuration:**
- Framework: Next.js
- Build Command: `npm run build`
- Output Directory: `.next`
- Node Version: 18.x or 20.x

**Benefits:**
- ✅ Free tier (generous limits)
- ✅ Global CDN
- ✅ Automatic HTTPS
- ✅ Zero configuration
- ✅ Preview deployments

##### 3. Alternative: Netlify

1. **Install Netlify CLI**
   ```bash
   npm i -g netlify-cli
   ```

2. **Deploy**
   ```bash
   netlify deploy --prod
   ```

3. **Configuration** (`netlify.toml`)
   ```toml
   [build]
     command = "npm run build"
     publish = ".next"
   
   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```

##### 4. Alternative: Static Export

For static hosting (GitHub Pages, AWS S3, etc.):

1. **Update `next.config.ts`**
   ```typescript
   const nextConfig: NextConfig = {
     output: 'export',
     images: {
       unoptimized: true
     }
   };
   ```

2. **Build**
   ```bash
   npm run build
   ```

3. **Deploy `out/` folder**
   - Upload `out/` folder contents to your static host
   - Configure redirects for client-side routing

**Note:** Static export has limitations:
- No server-side features
- No API routes
- Image optimization disabled

---

### Option 2: Hybrid (Frontend + Backend)

**Best for:** Faster processing, larger files, advanced features

#### Architecture
- Frontend: Vercel/Netlify
- Backend: Render.com, Railway, or DigitalOcean

#### Frontend Deployment

Follow **Option 1** steps for frontend deployment.

#### Backend Deployment

##### Option A: Render.com (Recommended for Free Tier)

1. **Create Account**
   - Sign up at [render.com](https://render.com)
   - Free tier: 750 hours/month

2. **Create Web Service**
   - Connect GitHub repository
   - Select `python-backend/` directory
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

3. **Environment Variables**
   - `PORT`: Automatically set by Render
   - Add any custom variables if needed

4. **Update Frontend CORS**
   - Update `python-backend/main.py` CORS settings:
   ```python
   allow_origins=[
       "https://your-frontend.vercel.app",
       "http://localhost:3000"
   ]
   ```

5. **Update Frontend API URL**
   - Update `API_BASE_URL` in `ComprehensiveEDFDashboard.tsx`:
   ```typescript
   const API_BASE_URL = 'https://your-backend.onrender.com';
   ```

**Benefits:**
- ✅ Free tier (750 hours/month)
- ✅ Auto-sleep when idle (saves resources)
- ✅ Automatic HTTPS
- ✅ Easy deployment

**Limitations:**
- ⚠️ Cold start time (~30 seconds after sleep)
- ⚠️ Free tier has resource limits

##### Option B: Railway

1. **Create Account**
   - Sign up at [railway.app](https://railway.app)
   - $5/month after free trial

2. **Deploy**
   - Connect GitHub repository
   - Select `python-backend/` directory
   - Railway auto-detects Python and installs dependencies

3. **Configuration**
   - Set start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Update CORS and frontend API URL (same as Render)

**Benefits:**
- ✅ Fast deployment
- ✅ Good performance
- ✅ No cold starts

**Limitations:**
- ⚠️ Paid after free trial

##### Option C: DigitalOcean App Platform

1. **Create Account**
   - Sign up at [digitalocean.com](https://digitalocean.com)
   - $200 free credit for 60 days

2. **Create App**
   - Connect GitHub repository
   - Select `python-backend/` directory
   - Configure build and run commands

3. **Pricing**
   - After credit: ~$5/month for basic plan

**Benefits:**
- ✅ Good performance
- ✅ Reliable infrastructure
- ✅ Free credit period

---

### Option 3: Self-Hosted

**Best for:** Full control, on-premises deployment

#### Requirements
- Server with Python 3.9+
- Node.js 18+ (for frontend build)
- Nginx or similar web server (optional)

#### Steps

1. **Build Frontend**
   ```bash
   npm install
   npm run build
   ```

2. **Deploy Frontend**
   - Copy `.next` folder to web server
   - Configure Nginx/Apache to serve Next.js

3. **Deploy Backend**
   ```bash
   cd python-backend
   python -m venv venv
   source venv/bin/activate  # or `venv\Scripts\activate` on Windows
   pip install -r requirements.txt
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

4. **Process Manager** (Production)
   - Use systemd, PM2, or supervisor
   - Example systemd service:
   ```ini
   [Unit]
   Description=EEG Platform Backend
   After=network.target

   [Service]
   User=www-data
   WorkingDirectory=/path/to/python-backend
   Environment="PATH=/path/to/venv/bin"
   ExecStart=/path/to/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000

   [Install]
   WantedBy=multi-user.target
   ```

---

## Environment Configuration

### Frontend Environment Variables

Create `.env.local` for local development:

```env
# Optional: Backend URL (if using local backend)
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Backend Environment Variables

Create `.env` in `python-backend/`:

```env
# Server configuration
HOST=0.0.0.0
PORT=8000

# CORS origins (comma-separated)
CORS_ORIGINS=http://localhost:3000,https://your-frontend.vercel.app
```

---

## Post-Deployment Checklist

### Frontend
- [ ] Verify Pyodide loads from CDN
- [ ] Test file upload/processing
- [ ] Check all analysis types work
- [ ] Verify PDF generation
- [ ] Test on different browsers
- [ ] Check mobile responsiveness

### Backend (if deployed)
- [ ] Verify API endpoints respond
- [ ] Test file upload
- [ ] Test analysis endpoints
- [ ] Check CORS configuration
- [ ] Verify file cleanup works
- [ ] Monitor error logs

### Security
- [ ] HTTPS enabled (automatic on Vercel/Render)
- [ ] CORS properly configured
- [ ] No sensitive data in code
- [ ] Environment variables secured
- [ ] File size limits enforced (if needed)

### Performance
- [ ] Test with various file sizes
- [ ] Monitor memory usage
- [ ] Check loading times
- [ ] Optimize images/assets
- [ ] Enable compression

---

## Troubleshooting

### Pyodide Not Loading

**Issue:** Pyodide fails to load from CDN

**Solutions:**
1. Check network connectivity
2. Verify CDN URL is accessible
3. Check browser console for errors
4. Consider hosting Pyodide locally

### Backend Connection Issues

**Issue:** Frontend can't connect to backend

**Solutions:**
1. Verify backend URL is correct
2. Check CORS configuration
3. Verify backend is running
4. Check firewall/network settings

### Large File Processing

**Issue:** Browser crashes or times out with large files

**Solutions:**
1. Use local backend mode
2. Implement chunked processing
3. Add file size warnings
4. Use Web Workers (future enhancement)

### Memory Issues

**Issue:** High memory usage in browser

**Solutions:**
1. Process files in chunks
2. Clear unused data
3. Use local backend for large files
4. Implement memory monitoring

---

## Monitoring and Maintenance

### Frontend Monitoring
- Use Vercel Analytics (if on Vercel)
- Monitor error rates
- Track performance metrics
- User feedback collection

### Backend Monitoring
- Application logs
- Error tracking (Sentry, etc.)
- Performance monitoring
- Resource usage tracking

### Regular Maintenance
- Update dependencies regularly
- Security patches
- Performance optimization
- User feedback review

---

## Cost Estimation

### Option 1: Browser Python Only
- **Frontend (Vercel):** $0/month (free tier)
- **Total:** $0/month

### Option 2: Hybrid (Render.com)
- **Frontend (Vercel):** $0/month
- **Backend (Render.com):** $0/month (free tier, 750 hrs)
- **Total:** $0/month (for typical usage)

### Option 3: Hybrid (Railway)
- **Frontend (Vercel):** $0/month
- **Backend (Railway):** $5/month (after trial)
- **Total:** $5/month

### Option 4: Self-Hosted
- **Server:** Varies ($5-50/month)
- **Domain:** ~$10-15/year
- **Total:** $5-50/month

---

## Recommended Deployment

**For Most Users:** Option 1 (Browser Python Only on Vercel)
- Zero cost
- Maximum privacy
- Simple deployment
- Sufficient for most use cases

**For Advanced Users:** Option 2 with Render.com
- Still free (within limits)
- Faster processing
- Better for large files
- More reliable

---

**Last Updated:** December 2024

