# Configuración de Variables de Entorno - Frontend

## Variables de Entorno para Vercel

Configura estas variables en **Vercel Dashboard** → **Settings** → **Environment Variables**

### Production, Preview, y Development

Agrega las siguientes 3 variables (aplican a todos los entornos):

---

### 1. NEXT_PUBLIC_SUPABASE_URL

**Value:**
```
https://fobaguhlzpwrzdhyyyje.supabase.co
```

**Environments:** ✅ Production, ✅ Preview, ✅ Development

---

### 2. NEXT_PUBLIC_SUPABASE_ANON_KEY

**Value:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvYmFndWhsenB3cnpkaHl5eWplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzMDkwOTcsImV4cCI6MjA3Njg4NTA5N30.1Vp8L7k-moEM2_1IuuN74oKR3Iwcq1NKtaYFzG0A6NY
```

**Environments:** ✅ Production, ✅ Preview, ✅ Development

---

### 3. NEXT_PUBLIC_WORKER_URL

**Value:**
```
https://worker-distancias.hi-4ba.workers.dev
```

**Environments:** ✅ Production, ✅ Preview, ✅ Development

---

## Desarrollo Local

Para desarrollo local, crea el archivo `autobank-dtv/.env.local`:

```bash
cd autobank-dtv
cp .env.local.example .env.local
```

El archivo `.env.local.example` ya tiene todos los valores correctos.

---

## Cómo configurar en Vercel Dashboard

1. Ve a: https://vercel.com/
2. Selecciona tu proyecto
3. **Settings** → **Environment Variables**
4. Para cada variable:
   - Click **"Add New"**
   - **Key:** nombre de la variable (ej: `NEXT_PUBLIC_SUPABASE_URL`)
   - **Value:** pega el valor
   - **Environments:** marca las 3 opciones (Production, Preview, Development)
   - Click **"Save"**

5. Después de agregar las 3 variables, ve a **Deployments**
6. Click en el último deployment → **"Redeploy"**

---

## Verificar configuración

Una vez deployado, verifica que las variables estén disponibles:

```javascript
console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)
console.log(process.env.NEXT_PUBLIC_WORKER_URL)
```

Deberían mostrar las URLs correctas.

