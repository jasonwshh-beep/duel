# Kick Duel Giveaway

Railway-ready Kick chat giveaway app.

Viewers type `!duel` in Kick chat to enter. On the dashboard, click **Roll 2 Fighters** and the app chooses two random entrants. The overlay shows an animated HP battle and announces the winner.

## Pages

- Dashboard: `/`
- OBS Overlay: `/overlay`

## Railway environment variables

Add these in Railway > Variables:

```env
KICK_CHANNEL=yourkickname
ADMIN_PIN=1234
ENTRY_COMMAND=!duel
MAX_HP=100
HIT_MIN=7
HIT_MAX=18
ROUND_MS=950
```

Only `KICK_CHANNEL` is required. Do not include `@` or `kick.com/`.

## Deploy

1. Upload this folder to a GitHub repository.
2. In Railway, create a new project from the GitHub repo.
3. Add the variables above.
4. Deploy.
5. Open your Railway domain:
   - `https://your-domain.up.railway.app/`
   - `https://your-domain.up.railway.app/overlay`

## OBS

Add a Browser Source with:

`https://your-domain.up.railway.app/overlay`

Suggested size: 650x430.

## Dashboard controls

Use your `ADMIN_PIN` on the dashboard to:

- Roll two fighters
- Lock/unlock entries
- Reset the pool
- Clear the duel
- Add test entries

## Notes

Kick chat connection uses Kick's public web chat websocket behavior. If Kick changes their chat internals, the dashboard will show a red connection error instead of silently failing.
