# Kick Duel Giveaway Mini-Game

Viewers type `!duel` in Kick chat to enter. Your Railway dashboard rolls two entrants, and the OBS overlay runs a 15-second medieval duel with attached sword-arm animations, sparks, HP bars, and a winner reveal.

## Railway variables

```env
KICK_CHANNEL=yourkickname
ADMIN_PIN=1234
ENTRY_COMMAND=!duel
```

Optional:

```env
KICK_CHATROOM_ID=1234567
DUEL_DURATION_MS=15000
ROUND_MS=500
MAX_HP=100
```

Do not manually set `PORT` on Railway.

## URLs

Dashboard: `/`

OBS overlay: `/overlay`

## OBS

Add a Browser Source using `https://your-app.up.railway.app/overlay`.
Recommended size: 1920x1080.
