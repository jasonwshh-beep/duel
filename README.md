# Kick Duel Giveaway - Railway Version

Viewers type `!duel` in Kick chat to enter the giveaway pool. From the dashboard you can roll two random entrants, and the OBS overlay shows a duel with HP bars until one winner remains.

## Railway Variables

Set these in Railway:

```env
KICK_CHANNEL=yourkickname
ADMIN_PIN=1234
ENTRY_COMMAND=!duel
```

Optional:

```env
KICK_CHATROOM_ID=1234567
MAX_HP=100
HIT_MIN=7
HIT_MAX=18
ROUND_MS=950
```

Do not manually set `PORT` on Railway.

## URLs

Dashboard: `https://your-app.up.railway.app/`

OBS overlay: `https://your-app.up.railway.app/overlay`

## Notes

This version uses the same Pusher-style Kick chat monitor as the earlier vote bot. If Railway cannot resolve the Kick chatroom ID, add `KICK_CHATROOM_ID` manually in Railway variables.
