# Kick Duel Giveaway Minigame

Railway-ready Kick chat duel giveaway app.

Viewers type `!duel` to enter. Dashboard rolls two users. Overlay runs a 15-second medieval duel where the fighters' own sword arms swing, clash, HP drains, and a winner is revealed.

## Railway Variables

KICK_CHANNEL=yourkickname
ADMIN_PIN=1234
ENTRY_COMMAND=!duel

Do not include @ or kick.com/ in KICK_CHANNEL.

## Routes

Dashboard: /
Overlay: /overlay

## Notes

This uses a Kick chat library. If Kick changes chat access, entries can still be manually added from the dashboard.
