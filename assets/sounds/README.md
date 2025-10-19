Add game sound effects here.

Naming suggestions (keeps code simple):
- spawn.ogg        — tile spawn
- merge.ogg        — tiles merge
- move.ogg         — tile slide/move
- win.ogg          — win/2048 achieved
- lose.ogg         — game over
- click.ogg        — UI click

Recommended formats:
- Web: prefer OGG (smaller, open) and/or WEBM for effects.
- Fallback: MP3 if you need broad compatibility.

Naming conventions:
- lowercase, hyphen/underscore separated, no spaces
- short, descriptive names

License:
- Only add assets you have the rights to use. Keep licensing info with any files you add.

How to use:
- Reference files from your JS with paths like `/assets/sounds/spawn.ogg`.
- Consider preloading for low latency (AudioContext or <audio> preloads).
