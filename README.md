# DEAD PARIS

A post-apocalyptic text adventure game set in the ruins of Paris.

**[Play it now](https://dead-paris.vercel.app/)**

You wake up in Room 302 of Le Meurice, one of the most expensive hotels in Paris. The world outside the window has ended. Dozens of figures stumble through the Tuileries Garden. The fountains are red.

Paris has fallen. And you are alone.

## About

Dead Paris is a browser-based survival text adventure with an 80s retro terminal aesthetic. Explore the hotel, scavenge for supplies, fight the undead, meet other survivors, and find one of four escape routes out of the city.

**No installation required** — play instantly at [dead-paris.vercel.app](https://dead-paris.vercel.app/) or host your own copy.

## Features

- **52 explorable locations** — 15 hotel rooms and 37 Paris exterior/underground areas
- **Survival mechanics** — manage health, hunger, and thirst to stay alive
- **Turn-based combat** — fight 6 types of zombies with scavenged weapons and armor
- **67 items** — weapons, food, water, medicine, quest items, and more
- **5 NPCs** — survivors with their own stories, dialogue, and trades
- **4 escape routes** — discover and complete quest chains to escape Paris
- **Day/night cycle** — nights are more dangerous, plan accordingly
- **Save system** — 3 save slots using local storage
- **CRT terminal UI** — retro green-on-black aesthetic with a modern layout

## How to Play

Type commands to explore, survive, and escape. Click **BEGIN** and start typing.

### Commands

| Command | Description |
|---------|-------------|
| `n` `s` `e` `w` | Move north, south, east, west |
| `u` / `d` | Go upstairs / downstairs |
| `look` | Examine your surroundings |
| `search` | Search for hidden items |
| `take [item]` | Pick up an item |
| `take all` | Pick up everything in the room |
| `drop [item]` | Drop an item |
| `use [item]` | Use, eat, or drink an item |
| `equip [item]` | Equip a weapon or armor |
| `attack` | Strike an enemy in combat |
| `defend` | Block incoming damage |
| `flee` | Attempt to escape combat |
| `talk [person]` | Talk to a survivor |
| `trade [person]` | Trade with a survivor |
| `rest` | Rest and heal |
| `save [1-3]` | Save to a slot |
| `load [1-3]` | Load from a slot |
| `help` | Show all commands in-game |

You can also pick up multiple items at once: `take snacks, water, backpack`

### Survival Tips

- Explore the hotel thoroughly before venturing outside
- Always equip a weapon before leaving safe areas
- Night time (9 PM - 6 AM) is dangerous — zombies are more active
- Thirst drains faster than hunger — prioritise finding water
- Search rooms to find hidden items
- Talk to every survivor — they have vital information
- Barricade safe rooms to rest without interruption
- Save often — death is permanent

## Tech Stack

- Vanilla HTML, CSS, and JavaScript (ES modules)
- No frameworks, no build tools, no dependencies
- JSON data files for maps, items, enemies, NPCs, and events
- LocalStorage for save/load

## Project Structure

```
dead-paris/
  index.html          — Game page
  css/style.css       — CRT terminal styling
  js/
    main.js           — Entry point and data loading
    engine.js         — Game state machine and core loop
    parser.js         — Command parsing and noun resolution
    commands.js       — Command handlers
    world.js          — Room/item/map management
    combat.js         — Turn-based combat system
    survival.js       — Hunger, thirst, and health mechanics
    events.js         — Scripted and random events
    npcs.js           — NPC dialogue and trading
    escapeRoutes.js   — Escape route quest logic
    ui.js             — UI rendering and status bar
  data/
    map-hotel.json    — Hotel room definitions
    map-paris.json    — Paris exterior/underground rooms
    items.json        — All item definitions
    enemies.json      — Zombie types and stats
    npcs.json         — NPC data and dialogue trees
    events.json       — Scripted and random events
    ascii-art.json    — ASCII art for locations
    help.json         — In-game help text
```

## Host Your Own Copy

Dead Paris is a fully static site — no server-side code, no build step, no dependencies. You can deploy it for free on any static hosting provider.

### Vercel (Recommended)

1. Fork this repository on GitHub
2. Go to [vercel.com](https://vercel.com) and sign up (free) with your GitHub account
3. Click **Add New Project** and import your forked repo
4. Leave all settings as default — Vercel will auto-detect it as a static site
5. Click **Deploy**

Your game will be live in seconds with a `.vercel.app` URL.

### Netlify

1. Fork this repository on GitHub
2. Go to [netlify.com](https://www.netlify.com) and sign up (free) with your GitHub account
3. Click **Add new site** > **Import an existing project**
4. Select your forked repo, leave all build settings blank
5. Click **Deploy site**

### GitHub Pages

1. Fork this repository on GitHub
2. Go to your fork's **Settings** > **Pages**
3. Under **Source**, select **Deploy from a branch**
4. Select the `master` branch and `/ (root)` folder
5. Click **Save** — your game will be live at `https://yourusername.github.io/dead-paris/`

### Run Locally

If you prefer to run it on your own machine:

```
git clone https://github.com/QuadMonkey/dead-paris.git
cd dead-paris
python -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

## License

MIT License — see [LICENSE](LICENSE) for details.

---

Made by **QuadMonkey** 2026
