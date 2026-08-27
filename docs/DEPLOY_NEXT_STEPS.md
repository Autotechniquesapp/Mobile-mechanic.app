# Deploy next steps

This branch contains the real Supabase/Netlify foundation for Mobile Mechanic AI.

## Netlify settings

Use the existing Netlify project that serves `mobile-mechanic.app`.

Build settings:

```text
Production branch: main
Base directory: blank
Build command: blank
Publish directory: public
Functions directory: netlify/functions
```

Environment variables already added:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Still required for public intake writes:

```text
SUPABASE_SERVICE_ROLE_KEY
APP_ORIGIN=https://mobile-mechanic.app
```

Optional AI variables:

```text
OPENAI_API_KEY
OPENAI_MODEL=gpt-5.6-luna
```

## Supabase settings

Authentication URL configuration:

```text
Site URL: https://mobile-mechanic.app
Redirect URL: https://mobile-mechanic.app/*
```

Run `supabase/schema.sql` in Supabase SQL editor before using real shop data.

## Safety

Do not put production secrets in GitHub or browser JavaScript. Keep unconnected services labeled Not Connected until each provider confirms real requests.
