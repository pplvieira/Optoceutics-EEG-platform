# 🚀 Railway Deployment Guide for Django Backend

This guide will help you deploy your Django EDF processing backend to Railway while keeping your Next.js frontend on Vercel.

## 📋 Prerequisites

- [Railway Account](https://railway.app) (free tier available)
- [Railway CLI](https://docs.railway.app/develop/cli) installed
- Git repository with your latest changes

## 🛠️ Step 1: Install Railway CLI

### Windows (PowerShell):
```powershell
iwr -useb https://railway.app/install.ps1 | iex
```

### macOS/Linux:
```bash
curl -fsSL https://railway.app/install.sh | sh
```

### Alternative (npm):
```bash
npm install -g @railway/cli
```

## 🚂 Step 2: Railway Setup & Deployment

### 1. Login to Railway
```bash
railway login
```
This will open your browser to authenticate.

### 2. Navigate to Project Root
```bash
cd path/to/eeg-platform
```

### 3. Initialize Railway Project
```bash
railway init
```
- Select "Empty Project"
- Give it a name like "eeg-backend" or "edf-processor"

### 4. Deploy to Railway
```bash
railway up
```
This will:
- Deploy your entire project to Railway
- Automatically detect the Django backend
- Install Python dependencies
- Run migrations
- Start the server

### 5. Set Environment Variables
```bash
railway variables set DJANGO_SETTINGS_MODULE=production_settings
railway variables set SECRET_KEY=your-super-secret-key-change-this
railway variables set DEBUG=False
```

### 6. Add Database (PostgreSQL)
```bash
railway add -d postgresql
```
Railway will automatically set the `DATABASE_URL` environment variable.

## 🌐 Step 3: Configure CORS for Your Vercel Domain

### 1. Get Your Railway Domain
```bash
railway domain
```
This will show your Railway backend URL (e.g., `https://eeg-backend-production.up.railway.app`)

### 2. Get Your Vercel Domain
After deploying to Vercel, you'll have a URL like `https://your-project.vercel.app`

### 3. Update CORS Settings
```bash
# Set allowed origins for CORS
railway variables set CORS_ALLOWED_ORIGINS="https://your-project.vercel.app,https://localhost:3000,https://localhost:3001"
```

## 🔧 Step 4: Update Frontend Configuration

### 1. Set Environment Variable in Vercel
In your Vercel dashboard:
- Go to Project Settings → Environment Variables
- Add: `NEXT_PUBLIC_API_URL` = `https://your-railway-backend.railway.app`

### 2. Alternative: Update api.ts directly
Replace the URL in `app/lib/api.ts`:
```typescript
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://your-actual-railway-url.railway.app'  // Replace with actual Railway URL
  : 'http://localhost:8000';
```

## 🎯 Step 5: Redeploy Frontend to Vercel

Push your changes to GitHub:
```bash
git add .
git commit -m "Update API configuration for Railway backend"
git push origin master
```

Vercel will automatically redeploy with the new backend URL.

## 🧪 Step 6: Test the Integration

1. **Visit your Vercel frontend** (e.g., `https://your-project.vercel.app`)
2. **Go to Developer Mode** → Analysis Tools or Signal Processing
3. **Try uploading an EDF file** to test the connection
4. **Check Railway logs** if issues occur:
   ```bash
   railway logs
   ```

## 📊 Step 7: Monitor Deployment

### View Railway Dashboard
```bash
railway open
```

### Check Service Status
```bash
railway status
```

### View Logs
```bash
railway logs --follow
```

## ⚙️ Railway Configuration Files Created

### `railway.json` (Railway-specific config)
- Defines build and deployment commands
- Handles migrations and static files

### `nixpacks.toml` (Build configuration)
- Specifies Python version and dependencies
- Sets up build phases

### `Procfile` (Process definition)
- Defines how to start the Django server

### `production_settings.py` (Production Django settings)
- Production-ready Django configuration
- PostgreSQL database support
- CORS configuration
- Security settings

## 🔍 Troubleshooting

### Common Issues:

#### 1. Build Failures
```bash
# Check build logs
railway logs --build

# Redeploy if needed
railway up --detach
```

#### 2. Database Connection Issues
```bash
# Check if PostgreSQL is added
railway variables

# Should see DATABASE_URL variable
```

#### 3. CORS Errors
```bash
# Update CORS origins
railway variables set CORS_ALLOWED_ORIGINS="https://your-vercel-domain.vercel.app"

# Restart service
railway restart
```

#### 4. Static Files Not Loading
```bash
# Force collectstatic
railway run python backend/manage.py collectstatic --noinput
```

### 5. File Upload Issues
- Check Railway storage limits (500MB per service)
- Large EDF files may need external storage (AWS S3, etc.)

## 💰 Railway Pricing

### Free Tier Limits:
- **$5/month credit** (enough for small projects)
- **500MB persistent storage**
- **Shared CPU/memory**
- **Custom domains** included

### Usage Monitoring:
```bash
railway usage
```

## 🎉 Success! Your Architecture:

```
User → Vercel (Next.js Frontend) → Railway (Django Backend) → PostgreSQL
```

- **Frontend**: `https://your-project.vercel.app`
- **Backend**: `https://your-backend.railway.app`
- **Database**: PostgreSQL (managed by Railway)
- **File Storage**: Railway persistent volumes

## 📝 Next Steps After Deployment:

1. **Test all EDF features** (upload, analysis, processing)
2. **Monitor resource usage** in Railway dashboard
3. **Set up custom domain** if needed (Railway Pro plan)
4. **Configure backup strategy** for uploaded files
5. **Set up monitoring/alerts** for production

## 🔄 Future Updates:

To update your backend:
```bash
git push origin master  # Updates GitHub
railway up              # Redeploys to Railway
```

Railway will automatically detect changes and redeploy your Django backend while Vercel handles frontend updates.