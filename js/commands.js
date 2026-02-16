// ============================================
// DEAD PARIS - Command Handlers
// Maps parsed verbs to game actions
// ============================================

import World from './world.js';
import Survival from './survival.js';
import NPCs from './npcs.js';
import EscapeRoutes from './escapeRoutes.js';

const Commands = {
    execute(parsed, gameState, engine) {
        const handler = this.handlers[parsed.verb];
        if (!handler) return { messages: [`You can't "${parsed.verb}" right now.`] };
        return handler(parsed, gameState, engine);
    },

    executeUse(parsed, gameState, engine) {
        return this.handlers.use(parsed, gameState, engine);
    },

    handlers: {
        // ---- MOVEMENT ----
        go(parsed, gameState, engine) {
            const dir = parsed.noun;
            if (!dir) return { messages: ['Go where? Specify a direction (north, south, east, west, upstairs, downstairs).'] };

            const result = World.canMove(gameState.player.location, dir);
            if (!result.can) {
                // Try to unlock with key in inventory
                if (result.locked && result.lockRequires) {
                    const hasKey = gameState.player.inventory.find(i => i.id === result.lockRequires);
                    if (hasKey) {
                        World.unlockExit(gameState.player.location, dir);
                        const msgs = [`You use the ${World.getItemName(result.lockRequires)} to unlock the way.`];
                        // Now move
                        const newResult = World.canMove(gameState.player.location, dir);
                        if (newResult.can) {
                            return Commands.doMove(newResult.roomId, gameState, engine, msgs, dir);
                        }
                    }
                }
                return { messages: [result.reason] };
            }

            return Commands.doMove(result.roomId, gameState, engine, [], dir);
        },

        // ---- LOOK ----
        look(parsed, gameState, engine) {
            if (parsed.noun) {
                // Look at specific item
                const itemInRoom = World.getRoomItems(gameState.player.location)
                    .find(i => i.id === parsed.noun || i.name.toLowerCase().includes(parsed.noun));
                if (itemInRoom) {
                    return { messages: [itemInRoom.description || `You see a ${itemInRoom.name}. Nothing special.`] };
                }
                const itemInInv = gameState.player.inventory.find(i => i.id === parsed.noun);
                if (itemInInv) {
                    const def = World.getItemDef(itemInInv.id);
                    return { messages: [def?.description || `You examine the ${itemInInv.id}.`] };
                }
                // Look at NPC
                const npcsHere = NPCs.getNpcsInRoom(gameState.player.location, gameState);
                const npc = npcsHere.find(n => n.id === parsed.noun || n.name.toLowerCase().includes(parsed.noun));
                if (npc) {
                    return { messages: [npc.description || `${npc.name} is here.`] };
                }
                return { messages: [`You don't see "${parsed.noun}" here.`] };
            }

            // Look at room
            engine.showRoom(gameState.player.location);
            return { messages: [] };
        },

        // ---- SEARCH ----
        search(parsed, gameState, engine) {
            const roomId = gameState.player.location;
            if (World.isRoomSearched(roomId)) {
                return { messages: ['You\'ve already thoroughly searched this area.'], timeElapsed: 5 };
            }

            const found = World.searchRoom(roomId);
            const messages = ['You search the area carefully...'];

            if (found.length > 0) {
                messages.push(`You find: ${found.map(i => i.name).join(', ')}!`);
            } else {
                messages.push('You find nothing of interest.');
            }

            return { messages, timeElapsed: 10 };
        },

        // ---- TAKE ----
        take(parsed, gameState, engine) {
            if (!parsed.noun) return { messages: ['Take what?'] };

            // Handle "take all" / "take everything"
            if (parsed.noun === 'all' || parsed.noun === 'everything') {
                const roomItems = World.getRoomItems(gameState.player.location);
                if (roomItems.length === 0) {
                    return { messages: ['There is nothing here to take.'] };
                }
                const allMessages = [];
                let totalTime = 0;
                const itemIds = roomItems.map(i => i.id);
                for (const id of itemIds) {
                    const result = Commands.takeSingle({ ...parsed, noun: id }, gameState, engine);
                    allMessages.push(...result.messages);
                    totalTime += (result.timeElapsed || 0);
                }
                return { messages: allMessages, timeElapsed: totalTime };
            }

            // Handle comma-separated items: "take snacks, water, backpack"
            if (parsed.raw && parsed.raw.includes(',')) {
                const rawAfterVerb = parsed.raw.replace(/^(take|pick\s+up|grab|get|collect)\s+/i, '');
                const itemNames = rawAfterVerb.split(',').map(s => s.trim()).filter(s => s);
                const allMessages = [];
                let totalTime = 0;
                for (const name of itemNames) {
                    const subParsed = { ...parsed, noun: name, raw: parsed.raw };
                    // Resolve the item name against room context
                    const roomItems = World.getRoomItems(gameState.player.location);
                    const match = roomItems.find(i =>
                        i.id === name ||
                        i.name.toLowerCase() === name.toLowerCase() ||
                        i.name.toLowerCase().includes(name.toLowerCase()));
                    if (match) subParsed.noun = match.id;
                    const result = Commands.takeSingle(subParsed, gameState, engine);
                    allMessages.push(...result.messages);
                    totalTime += (result.timeElapsed || 0);
                }
                return { messages: allMessages, timeElapsed: totalTime };
            }

            return Commands.takeSingle(parsed, gameState, engine);
        },

        // ---- DROP ----
        drop(parsed, gameState, engine) {
            if (!parsed.noun) return { messages: ['Drop what?'] };

            const itemId = parsed.noun;
            const invEntry = gameState.player.inventory.find(i => i.id === itemId);
            if (!invEntry) {
                // Fuzzy
                const fuzzy = gameState.player.inventory.find(i => {
                    const def = World.getItemDef(i.id);
                    return def && def.name.toLowerCase().includes(itemId.toLowerCase());
                });
                if (fuzzy) return Commands.handlers.drop({ ...parsed, noun: fuzzy.id }, gameState, engine);
                return { messages: ['You\'re not carrying that.'] };
            }

            const itemDef = World.getItemDef(itemId);
            Commands.removeFromInventory(gameState, itemId);
            World.addItemToRoom(gameState.player.location, itemId);
            gameState.player.currentWeight -= (itemDef?.weight || 0);

            // Unequip if dropping equipped item
            if (gameState.player.equippedWeapon && gameState.player.equippedWeapon.id === itemId) {
                gameState.player.equippedWeapon = null;
            }
            if (gameState.player.equippedArmor && gameState.player.equippedArmor.id === itemId) {
                gameState.player.equippedArmor = null;
            }

            return { messages: [`You drop the ${itemDef?.name || itemId}.`], timeElapsed: 1 };
        },

        // ---- USE ----
        use(parsed, gameState, engine) {
            if (!parsed.noun) return { messages: ['Use what?'] };

            const itemId = parsed.noun;
            const invEntry = gameState.player.inventory.find(i => i.id === itemId);
            if (!invEntry) {
                const fuzzy = gameState.player.inventory.find(i => {
                    const def = World.getItemDef(i.id);
                    return def && def.name.toLowerCase().includes(itemId.toLowerCase());
                });
                if (fuzzy) return Commands.handlers.use({ ...parsed, noun: fuzzy.id }, gameState, engine);
                return { messages: ['You\'re not carrying that.'] };
            }

            const itemDef = World.getItemDef(itemId);
            if (!itemDef) return { messages: ['You can\'t use that.'] };

            const messages = [];

            // Food
            if (itemDef.type === 'food') {
                const eatMsgs = Survival.eat(gameState, itemDef);
                messages.push(...eatMsgs);
                Commands.removeFromInventory(gameState, itemId);
                return { messages, timeElapsed: 5 };
            }

            // Water
            if (itemDef.type === 'water') {
                const drinkMsgs = Survival.eat(gameState, itemDef);
                messages.push(...drinkMsgs);
                Commands.removeFromInventory(gameState, itemId);
                return { messages, timeElapsed: 5 };
            }

            // Medicine
            if (itemDef.type === 'medicine') {
                const healMsgs = Survival.heal(gameState, itemDef);
                messages.push(...healMsgs);
                Commands.removeFromInventory(gameState, itemId);
                return { messages, timeElapsed: 5 };
            }

            // Flashlight batteries
            if (itemId === 'flashlight_batteries') {
                const flashlight = gameState.player.inventory.find(i => i.id === 'flashlight');
                if (flashlight) {
                    messages.push('You replace the flashlight batteries. The beam strengthens.');
                    // Reset flashlight durability
                    if (gameState.player.equippedWeapon && gameState.player.equippedWeapon.id === 'flashlight') {
                        gameState.player.equippedWeapon.currentDurability = 50;
                    }
                    Commands.removeFromInventory(gameState, itemId);
                } else {
                    messages.push('You have no flashlight to put these in.');
                }
                return { messages, timeElapsed: 2 };
            }

            // Crowbar on sewer grate
            if (itemId === 'crowbar' && parsed.modifier) {
                messages.push('You wedge the crowbar into place and heave.');
                return { messages, timeElapsed: 10 };
            }

            // Escape route triggers
            const loc = gameState.player.location;
            const hasInv = (id) => gameState.player.inventory.some(i => i.id === id);

            // Seine boat repair at seine_dock
            if ((itemId === 'toolbox' || itemId === 'boat_engine_part') && loc === 'seine_dock') {
                if (hasInv('boat_engine_part') && hasInv('toolbox') &&
                    (hasInv('fuel_can') || hasInv('gasoline_can'))) {
                    messages.push('You open the toolbox and get to work on the engine.');
                    messages.push('Hours pass. Your hands are bleeding and your back aches.');
                    messages.push('You replace the starter motor, patch the hull with duct tape and hope,');
                    messages.push('and pour the fuel into the tank.');
                    messages.push('The engine coughs once. Twice. Then roars to life.');
                    messages.push('You cast off from the dock...');
                    // The escape route check in engine.js will pick this up
                    gameState.player.questFlags.boat_repaired = true;
                    return { messages, timeElapsed: 120 };
                } else {
                    messages.push('You examine the boat. You still need:');
                    if (!hasInv('boat_engine_part')) messages.push('  - A boat engine part');
                    if (!hasInv('toolbox')) messages.push('  - A toolbox');
                    if (!hasInv('fuel_can') && !hasInv('gasoline_can')) messages.push('  - Fuel');
                    return { messages };
                }
            }

            // Airport drive from champs_elysees
            if (itemId === 'car_keys' && loc === 'champs_elysees_start') {
                if (hasInv('gasoline_can') && hasInv('radio_parts') &&
                    hasInv('military_radio_parts') && hasInv('batteries') && hasInv('radio_manual')) {
                    messages.push('You find the police car where Moreau said it would be.');
                    messages.push('You pour the gasoline into the tank and turn the key.');
                    messages.push('The Peugeot roars to life. You tune the radio to 121.5 MHz.');
                    messages.push('"Mayday, mayday. Survivor heading to CDG. Request extraction."');
                    messages.push('Static. Then: "Copy, survivor. Runway 09R. We have a window at dawn."');
                    messages.push('You floor the accelerator and head northeast...');
                    gameState.player.questFlags.airport_driving = true;
                    return { messages, timeElapsed: 180 };
                } else {
                    messages.push('You find the police car but you need more to make the trip:');
                    if (!hasInv('gasoline_can')) messages.push('  - Gasoline');
                    if (!hasInv('radio_parts') || !hasInv('military_radio_parts') || !hasInv('batteries'))
                        messages.push('  - A working radio (radio parts + military radio parts + batteries)');
                    if (!hasInv('radio_manual')) messages.push('  - Radio frequency manual');
                    return { messages };
                }
            }

            // Helicopter signal from rooftop
            if ((itemId === 'flare' || itemId === 'flare_gun') && loc === 'rooftop') {
                if (hasInv('radio_parts') && hasInv('military_radio_parts') &&
                    hasInv('batteries') && hasInv('radio_manual') &&
                    (hasInv('flare') || hasInv('flare_gun'))) {
                    gameState.player.questFlags.rooftop_cleared = true;
                    messages.push('You assemble the radio with trembling hands and tune to 121.5 MHz.');
                    messages.push('"Mayday, mayday. Survivor at Le Meurice hotel rooftop. Request extraction."');
                    messages.push('Silence. Then: "Copy, Le Meurice. Inbound. Pop your flare."');
                    messages.push('You fire the flare into the night sky. It burns brilliant red above Paris.');
                    messages.push('Minutes pass. Then you hear it - the thrum of rotor blades...');
                    gameState.player.questFlags.helicopter_signaled = true;
                    return { messages, timeElapsed: 30 };
                } else {
                    messages.push('You need everything ready before signaling:');
                    if (!hasInv('radio_parts') || !hasInv('military_radio_parts') || !hasInv('batteries'))
                        messages.push('  - A working radio (radio parts + military radio parts + batteries)');
                    if (!hasInv('radio_manual')) messages.push('  - Radio frequency manual');
                    if (!hasInv('flare') && !hasInv('flare_gun')) messages.push('  - A flare or flare gun');
                    return { messages };
                }
            }

            // Quest items - generic message if not at the right location
            if (itemDef.type === 'quest') {
                messages.push(`You examine the ${itemDef.name}. You'll need to use it at the right location.`);
                return { messages };
            }

            messages.push(itemDef.useMessage || `You use the ${itemDef.name}.`);
            return { messages, timeElapsed: 5 };
        },

        // ---- EQUIP ----
        equip(parsed, gameState, engine) {
            if (!parsed.noun) return { messages: ['Equip what?'] };

            const itemId = parsed.noun;
            const invEntry = gameState.player.inventory.find(i => i.id === itemId);
            if (!invEntry) {
                const fuzzy = gameState.player.inventory.find(i => {
                    const def = World.getItemDef(i.id);
                    return def && def.name.toLowerCase().includes(itemId.toLowerCase());
                });
                if (fuzzy) return Commands.handlers.equip({ ...parsed, noun: fuzzy.id }, gameState, engine);
                return { messages: ['You\'re not carrying that.'] };
            }

            const itemDef = World.getItemDef(itemId);
            if (!itemDef) return { messages: ['You can\'t equip that.'] };

            if (itemDef.type === 'weapon' || (itemDef.damage && itemDef.damage[0] > 0)) {
                gameState.player.equippedWeapon = { ...itemDef, currentDurability: itemDef.durability };
                return { messages: [`You equip the ${itemDef.name}.`] };
            }

            if (itemDef.type === 'armor') {
                gameState.player.equippedArmor = { ...itemDef };
                return { messages: [`You put on the ${itemDef.name}.`] };
            }

            return { messages: [`You can't equip the ${itemDef.name}.`] };
        },

        // ---- UNEQUIP ----
        unequip(parsed, gameState, engine) {
            if (!parsed.noun) {
                const msgs = [];
                if (gameState.player.equippedWeapon) {
                    msgs.push(`Weapon: ${gameState.player.equippedWeapon.name}`);
                }
                if (gameState.player.equippedArmor) {
                    msgs.push(`Armor: ${gameState.player.equippedArmor.name}`);
                }
                if (msgs.length === 0) msgs.push('You have nothing equipped.');
                msgs.push('Type "unequip [item]" to remove equipment.');
                return { messages: msgs };
            }

            if (gameState.player.equippedWeapon &&
                (gameState.player.equippedWeapon.id === parsed.noun ||
                 gameState.player.equippedWeapon.name.toLowerCase().includes(parsed.noun))) {
                const name = gameState.player.equippedWeapon.name;
                gameState.player.equippedWeapon = null;
                return { messages: [`You put away the ${name}.`] };
            }

            if (gameState.player.equippedArmor &&
                (gameState.player.equippedArmor.id === parsed.noun ||
                 gameState.player.equippedArmor.name.toLowerCase().includes(parsed.noun))) {
                const name = gameState.player.equippedArmor.name;
                gameState.player.equippedArmor = null;
                return { messages: [`You remove the ${name}.`] };
            }

            return { messages: ['You don\'t have that equipped.'] };
        },

        // ---- INVENTORY ----
        inventory(parsed, gameState, engine) {
            const inv = gameState.player.inventory;
            if (inv.length === 0) {
                return { messages: ['You are carrying nothing.'] };
            }

            const messages = ['You are carrying:'];
            const grouped = {};
            for (const entry of inv) {
                if (!grouped[entry.id]) grouped[entry.id] = 0;
                grouped[entry.id] += entry.quantity || 1;
            }

            for (const [id, qty] of Object.entries(grouped)) {
                const def = World.getItemDef(id);
                const name = def ? def.name : id;
                const weight = def ? def.weight : 0;
                const equipped = (gameState.player.equippedWeapon?.id === id) ? ' [EQUIPPED]' :
                    (gameState.player.equippedArmor?.id === id) ? ' [WORN]' : '';
                const qtyStr = qty > 1 ? ` (x${qty})` : '';
                messages.push(`  ${name}${qtyStr} [${weight}kg]${equipped}`);
            }

            const maxW = gameState.player.maxWeight + Commands.getExtraCarryCapacity(gameState);
            messages.push(`Weight: ${gameState.player.currentWeight.toFixed(1)}/${maxW}kg`);
            return { messages };
        },

        // ---- TALK ----
        talk(parsed, gameState, engine) {
            const roomId = gameState.player.location;
            const npcsHere = NPCs.getNpcsInRoom(roomId, gameState);

            if (npcsHere.length === 0) {
                return { messages: ['There is no one here to talk to.'] };
            }

            let npc;
            if (parsed.noun) {
                npc = npcsHere.find(n => n.id === parsed.noun ||
                    n.name.toLowerCase().includes(parsed.noun.toLowerCase()));
            }
            if (!npc) npc = npcsHere[0];

            const result = NPCs.startDialogue(npc.id, gameState);
            if (result) {
                gameState.currentState = 'DIALOGUE';
                return { messages: result.messages };
            }
            return { messages: [`${npc.name} has nothing to say right now.`] };
        },

        // ---- TRADE ----
        trade(parsed, gameState, engine) {
            return Commands.handlers.talk(parsed, gameState, engine);
        },

        // ---- GIVE ----
        give(parsed, gameState, engine) {
            if (!parsed.noun || !parsed.modifier) {
                return { messages: ['Give what to whom? Try: give [item] to [person]'] };
            }
            const roomId = gameState.player.location;
            const npcsHere = NPCs.getNpcsInRoom(roomId, gameState);
            const npc = npcsHere.find(n => n.id === parsed.modifier ||
                n.name.toLowerCase().includes(parsed.modifier.toLowerCase()));
            if (!npc) return { messages: [`You don't see ${parsed.modifier} here.`] };

            const invEntry = gameState.player.inventory.find(i => i.id === parsed.noun);
            if (!invEntry) return { messages: ['You\'re not carrying that.'] };

            const result = NPCs.giveItem(npc.id, parsed.noun, gameState);
            if (result) {
                Commands.removeFromInventory(gameState, parsed.noun);
                return { messages: result.messages, timeElapsed: 5 };
            }
            return { messages: [`${npc.name} doesn't want that.`] };
        },

        // ---- WAIT/REST ----
        wait(parsed, gameState, engine) {
            let hours = 1;
            if (parsed.noun) {
                const n = parseInt(parsed.noun);
                if (!isNaN(n) && n > 0 && n <= 12) hours = n;
            }
            if (parsed.raw.includes('sleep')) hours = Math.max(hours, 6);

            const messages = Survival.rest(gameState, hours);
            return { messages, moved: false };
        },

        // ---- BARRICADE ----
        barricade(parsed, gameState, engine) {
            const roomId = gameState.player.location;
            if (!World.isBarricadeable(roomId)) {
                return { messages: ['You can\'t barricade this location.'] };
            }
            if (World.isBarricaded(roomId)) {
                return { messages: ['This location is already barricaded.'] };
            }
            // Need wooden planks
            const planks = gameState.player.inventory.filter(i => i.id === 'wooden_plank');
            if (planks.length < 2) {
                return { messages: ['You need at least 2 wooden planks to barricade this area.'] };
            }
            // Use the planks
            Commands.removeFromInventory(gameState, 'wooden_plank');
            Commands.removeFromInventory(gameState, 'wooden_plank');
            gameState.player.currentWeight -= 3; // 1.5kg each
            World.setBarricaded(roomId, true);

            return {
                messages: [
                    'You nail the planks across the entrance, reinforcing the barriers.',
                    'This area is now barricaded. Zombies are less likely to get in.',
                    'You can rest more safely here.'
                ],
                timeElapsed: 30
            };
        },

        // ---- OPEN/UNLOCK ----
        open(parsed, gameState, engine) {
            return Commands.handlers.unlock(parsed, gameState, engine);
        },

        unlock(parsed, gameState, engine) {
            if (!parsed.noun) return { messages: ['Unlock what? Specify a direction.'] };

            const dir = parsed.noun;
            const roomId = gameState.player.location;
            const exits = World.getRoomExits(roomId);

            if (!exits[dir]) return { messages: ['There\'s nothing to unlock in that direction.'] };
            if (!exits[dir].locked) return { messages: ['It\'s not locked.'] };

            const lockReq = exits[dir].lockRequires;
            if (lockReq) {
                // Check for key
                const hasKey = gameState.player.inventory.find(i => i.id === lockReq);
                if (hasKey) {
                    World.unlockExit(roomId, dir);
                    return { messages: [`You use the ${World.getItemName(lockReq)} to unlock the way.`], timeElapsed: 2 };
                }
                // Check for lockpick
                const hasLockpick = gameState.player.inventory.find(i => i.id === 'lockpick_set');
                if (hasLockpick && lockReq !== 'crowbar' && lockReq !== 'lobby_barricade_key') {
                    if (Math.random() < 0.6) {
                        World.unlockExit(roomId, dir);
                        return { messages: ['You work the lockpick carefully... *click*. It\'s open.'], timeElapsed: 10 };
                    } else {
                        return { messages: ['You fumble with the lockpick but can\'t get it open. Try again?'], timeElapsed: 5 };
                    }
                }
                // Check for crowbar (for grates/physical locks)
                if (lockReq === 'crowbar') {
                    const hasCrowbar = gameState.player.inventory.find(i => i.id === 'crowbar');
                    if (hasCrowbar) {
                        World.unlockExit(roomId, dir);
                        return { messages: ['You wedge the crowbar in and heave. The grate gives way with a screech of rusted metal.'], timeElapsed: 10 };
                    }
                }
                return { messages: [`It's locked. You need a ${World.getItemName(lockReq)}.`] };
            }

            return { messages: ['It\'s locked and you don\'t have the right tool to open it.'] };
        },

        close(parsed, gameState) {
            return { messages: ['You close it.'], timeElapsed: 1 };
        },

        lock(parsed, gameState) {
            return { messages: ['You don\'t have a way to lock that.'] };
        },

        // ---- STATUS ----
        status(parsed, gameState, engine) {
            const lines = Survival.getStatusText(gameState);
            lines.push('');
            lines.push('=== ESCAPE ROUTES ===');
            const routeLines = EscapeRoutes.getRouteStatus(gameState);
            lines.push(...routeLines);
            return { messages: lines };
        },

        // ---- HELP ----
        help(parsed, gameState, engine) {
            const messages = [
                '=== DEAD PARIS - COMMANDS ===',
                '',
                'MOVEMENT:  go [direction] or just north/south/east/west/n/s/e/w',
                '           upstairs/downstairs (or u/d)',
                '',
                'ACTIONS:   look (l) - examine surroundings',
                '           look [item/person] - examine something specific',
                '           search - search the area for hidden items',
                '           take [item] - pick up (use commas for multiple)',
                '           drop [item] - drop an item',
                '           use [item] - use/eat/drink an item',
                '           equip [weapon/armor] - equip a weapon or armor',
                '           unequip [item] - remove equipped item',
                '           inventory (i) - show what you\'re carrying',
                '',
                'INTERACT:  talk [person] - talk to someone',
                '           trade [person] - trade with someone',
                '           give [item] to [person] - give an item',
                '           unlock [direction] - unlock a locked exit',
                '           barricade - fortify current location (needs planks)',
                '',
                'COMBAT:    attack - strike the enemy',
                '           defend - reduce incoming damage',
                '           flee - attempt to escape',
                '           use [item] - use an item mid-combat',
                '',
                'SURVIVAL:  wait [hours] / rest / sleep - pass time and heal',
                '           status - check your vitals',
                '',
                'SYSTEM:    save [1-3] - save game',
                '           load [1-3] - load game',
                '           help (h) - show this list',
                '',
                'GOAL: Survive 30 days OR find one of 4 escape routes out of Paris.',
                '      Explore, scavenge, fight, and stay alive.'
            ];
            return { messages };
        },

        // ---- SAVE ----
        save(parsed, gameState, engine) {
            const slot = parsed.noun || '1';
            if (engine.saveGame(slot)) {
                return { messages: [`Game saved to slot ${slot}.`] };
            }
            return { messages: ['Failed to save game.'] };
        },

        // ---- LOAD ----
        load(parsed, gameState, engine) {
            const slot = parsed.noun || '1';
            if (engine.loadGame(slot)) {
                engine.showRoom(engine.gameState.player.location, false);
                return { messages: [`Game loaded from slot ${slot}.`] };
            }
            // Try listing saves
            const saves = engine.listSaves();
            if (saves.length === 0) {
                return { messages: ['No saved games found.'] };
            }
            const msgs = ['Available saves:'];
            for (const s of saves) {
                const date = new Date(s.timestamp).toLocaleString();
                msgs.push(`  ${s.slot}: Day ${s.day} (${date})`);
            }
            return { messages: msgs };
        },

        // ---- MAP ----
        map(parsed, gameState, engine) {
            const hasMap = gameState.player.inventory.some(i =>
                i.id === 'hotel_map' || i.id === 'metro_map' || i.id === 'sewer_map');
            if (!hasMap) {
                return { messages: ['You don\'t have a map. Find one to see your surroundings.'] };
            }

            const current = gameState.player.location;
            const room = World.getRoom(current);
            const exits = World.getRoomExits(current);
            const messages = [`Current location: ${room?.name || current}`];
            messages.push('Nearby:');
            for (const [dir, exit] of Object.entries(exits)) {
                const target = World.getRoom(exit.roomId);
                const lockStr = exit.locked ? ' [LOCKED]' : '';
                messages.push(`  ${dir}: ${target?.name || exit.roomId}${lockStr}`);
            }
            return { messages };
        },

        // ---- QUIT ----
        quit(parsed, gameState, engine) {
            return { messages: ['There is no quitting. Only survival. (Your progress auto-saves at the start of each day.)'] };
        },

        // ---- ATTACK (outside combat - initiate if zombies present) ----
        attack(parsed, gameState, engine) {
            return { messages: ['There\'s nothing to attack here. (Encounters happen when you explore.)'] };
        }
    },

    // Single-item take helper
    takeSingle(parsed, gameState, engine) {
        const roomId = gameState.player.location;
        const itemId = parsed.noun;
        const roomItemIds = World.getRoomItemIds(roomId);

        if (!roomItemIds.includes(itemId)) {
            // Fuzzy match
            const def = World.getRoomItems(roomId).find(i =>
                i.name.toLowerCase().includes(itemId.toLowerCase()));
            if (def) {
                return Commands.takeSingle({ ...parsed, noun: def.id }, gameState, engine);
            }
            return { messages: [`You don't see a "${itemId}" here.`] };
        }

        const itemDef = World.getItemDef(itemId);
        if (!itemDef) return { messages: [`You can't take that.`] };

        // Weight check
        const weight = itemDef.weight || 0;
        const maxWeight = gameState.player.maxWeight +
            Commands.getExtraCarryCapacity(gameState);
        if (gameState.player.currentWeight + weight > maxWeight) {
            return { messages: ['You are carrying too much. Drop something first.'] };
        }

        // Remove from room, add to inventory
        World.removeItemFromRoom(roomId, itemId);
        Commands.addToInventory(gameState, itemId);
        gameState.player.currentWeight += weight;

        // Auto-equip if it's a container
        if (itemDef.type === 'container' && itemDef.carryCapacity) {
            return { messages: [`You pick up the ${itemDef.name}. (+${itemDef.carryCapacity}kg carry capacity)`], timeElapsed: 2 };
        }

        return { messages: [`You take the ${itemDef.name}.`], timeElapsed: 2 };
    },

    // Movement helper
    doMove(targetRoomId, gameState, engine, preMsgs = [], direction = '') {
        const messages = [...preMsgs];
        const oldLocation = gameState.player.location;
        gameState.player.location = targetRoomId;

        // Calculate travel time based on zone
        const oldRoom = World.getRoom(oldLocation);
        const newRoom = World.getRoom(targetRoomId);
        let travelTime = 5;
        if (oldRoom?.zone === 'exterior' && newRoom?.zone === 'exterior') travelTime = 15;
        if (oldRoom?.zone === 'underground' || newRoom?.zone === 'underground') travelTime = 10;

        // Show new room
        engine.showRoom(targetRoomId, true);

        return { messages, timeElapsed: travelTime, moved: true };
    },

    // Inventory helpers
    addToInventory(gameState, itemId) {
        const existing = gameState.player.inventory.find(i => i.id === itemId);
        const def = World.getItemDef(itemId);
        if (existing && def?.stackable) {
            existing.quantity = (existing.quantity || 1) + 1;
        } else {
            gameState.player.inventory.push({ id: itemId, quantity: 1 });
        }
    },

    removeFromInventory(gameState, itemId) {
        const idx = gameState.player.inventory.findIndex(i => i.id === itemId);
        if (idx === -1) return false;
        const entry = gameState.player.inventory[idx];
        if (entry.quantity > 1) {
            entry.quantity--;
        } else {
            gameState.player.inventory.splice(idx, 1);
        }
        const def = World.getItemDef(itemId);
        if (def) {
            gameState.player.currentWeight = Math.max(0, gameState.player.currentWeight - (def.weight || 0));
        }
        return true;
    },

    getExtraCarryCapacity(gameState) {
        let extra = 0;
        for (const entry of gameState.player.inventory) {
            const def = World.getItemDef(entry.id);
            if (def?.carryCapacity) extra += def.carryCapacity;
        }
        return extra;
    }
};

export default Commands;
