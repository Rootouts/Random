# RandomTalk
Anonymous voice-only chat: random matching, nearby/gender filters, friends, group calls, INR premium, and admin live-audio moderation.

## Stack
- web/ — React + Vite + Tailwind  → Vercel
- server/ — Node + Socket.io       → Render
- Supabase (Postgres + Auth + RLS), Razorpay (payments), coturn/Metered (TURN)

## Prerequisites
Node 18+, a Supabase project, a Razorpay account, (optional) a VPS for coturn.

## 1) Supabase
1. Create a project → SQL editor → run `supabase/schema.sql`.
2. Authentication → enable Email (and any OAuth you want).
3. Copy Project URL, `anon` key, and `service_role` key.
4. After you sign up in the app once, make yourself admin/premium:
```sql
   update public.profiles set role='admin', premium=true where id='YOUR-AUTH-UID';
```

## 2) Server (Render)
```bash
cd server && cp .env.example .env   # fill values
npm install && npm start            # http://localhost:8080
```
Deploy: Render → New Web Service → root `server/`, Build `npm install`, Start `npm start`, add env from `.env.example`.
Razorpay → Settings → Webhooks → `https://<render-app>/api/razorpay/webhook`, secret = `RAZORPAY_WEBHOOK_SECRET`,
events: `payment.captured` (+ `subscription.charged`, `subscription.activated`, `subscription.halted`, `subscription.cancelled` if using auto-renew).

## 3) Web (Vercel)
```bash
cd web && cp .env.example .env   # fill values
npm install && npm run dev       # http://localhost:5173
```
Deploy: Vercel → import `web/` → add env from `.env.example`. Set the server's `CLIENT_ORIGIN` to your Vercel URL.

## 4) TURN (when ready)
Quick start: use Metered Open Relay creds in `VITE_TURN_*`. Production: install coturn (see `turn/turnserver.conf`).

## Notes
- Audio is peer-to-peer (WebRTC); the server only relays signaling, so one instance handles ~750 concurrent calls. Scale-out: set `REDIS_URL` + sticky sessions.
- **Admin monitoring** (listen/talk) is for trust & safety. Monitoring/recording calls is legally regulated — keep the "this call may be monitored" notice and disclose it in your Terms/Privacy policy.
