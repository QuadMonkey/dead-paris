// ============================================
// DEAD PARIS - Core Game Engine
// State machine, game loop, save/load
// Made by QuadMonkey 2026
// ============================================

import UI from './ui.js';
import Parser from './parser.js';
import World from './world.js';
import Combat from './combat.js';
import Survival from './survival.js';
import Commands from './commands.js';
import NPCs from './npcs.js';
import Events from './events.js';
import EscapeRoutes from './escapeRoutes.js';

const Engine = {
    gameState: null,
    helpData: null,
    initialized: false,

    async init() {
        UI.init();
        UI.hideStatusBar();
        UI.hideInput();

        try {
            const [hotelData, parisData, itemsData, enemiesData, npcsData, eventsData, helpData] =
                await Promise.all([
                    this.loadJSON('data/map-hotel.json'),
                    this.loadJSON('data/map-paris.json'),
                    this.loadJSON('data/items.json'),
                    this.loadJSON('data/enemies.json'),
                    this.loadJSON('data/npcs.json'),
                    this.loadJSON('data/events.json'),
                    this.loadJSON('data/help.json'),
                ]);

            World.init(hotelData, parisData, itemsData);
            Combat.init(enemiesData);
            NPCs.init(npcsData);
            Events.init(eventsData);
            EscapeRoutes.init();

            this.helpData = helpData;
            this.initialized = true;

            // Show intro modal and wait for Begin
            UI.showIntroModal(() => this.startNewGame());
        } catch (err) {
            UI.print(`Error loading game data: ${err.message}`, 'damage');
            console.error(err);
        }
    },

    async loadJSON(path) {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
        return response.json();
    },

    createNewGameState() {
        return {
            currentState: 'EXPLORING',
            player: {
                health: 100,
                maxHealth: 100,
                hunger: 100,
                thirst: 100,
                location: 'room_302',
                inventory: [],
                maxWeight: 20,
                currentWeight: 0,
                equippedWeapon: null,
                equippedArmor: null,
                companions: [],
                questFlags: {},
                kills: 0,
                infected: false
            },
            world: {
                time: { day: 1, hour: 6, minute: 0 },
                zombieAlertLevel: 1
            },
            combat: {
                enemy: null,
                isDefending: false,
                roundCount: 0
            },
            escapeRoutes: {
                seine_boat: { discovered: false, currentStep: 0 },
                airport: { discovered: false, currentStep: 0 },
                catacombs: { discovered: false, currentStep: 0 },
                helicopter: { discovered: false, currentStep: 0 }
            },
            currentRoomName: 'Room 302',
            currentRoomZone: 'hotel',
            isCurrentRoomBarricaded: false
        };
    },

    startNewGame() {
        this.gameState = this.createNewGameState();
        UI.clearOutput();
        UI.showStatusBar();
        UI.updateStatusBar(this.gameState);
        UI.updateInventory(this.gameState);

        // Show starting room
        this.showRoom(this.gameState.player.location, true);

        // Enable input
        UI.showInput();
        UI.enableInput();
        UI.onCommand = (input) => this.processCommand(input);
    },

    showRoom(roomId, isEntry = false) {
        const room = World.getRoom(roomId);
        if (!room) return;

        const isFirst = World.isFirstVisit(roomId);
        const timeOfDay = Survival.getTimeOfDay(this.gameState.world.time.hour);

        if (isEntry) World.markVisited(roomId);

        // Room name
        UI.print(room.name, 'room-name');

        // Description
        const desc = World.getRoomDescription(roomId, timeOfDay, isFirst);
        UI.print(desc);

        // Light level warning
        if (room.lightLevel === 'dark') {
            const hasLight = this.playerHasLight();
            if (!hasLight) {
                UI.print('It is pitch dark. You can barely see. You need a light source.', 'warning');
            }
        }

        // Items in room
        const items = World.getRoomItems(roomId);
        if (items.length > 0) {
            const itemNames = this.groupItems(World.getRoomItemIds(roomId));
            UI.print(`You can see: ${itemNames}`, 'item');
        }

        // NPCs present
        const npcsHere = NPCs.getNpcsInRoom(roomId, this.gameState);
        for (const npc of npcsHere) {
            UI.print(npc.presenceText || `${npc.name} is here.`, 'npc');
        }

        // Room notes
        const note = World.getRoomNote(roomId);
        if (note && isFirst) {
            UI.printBlank();
            UI.print(note, 'narrative');
        }

        // Exits
        const exitDescs = World.getExitDescription(roomId);
        if (exitDescs.length > 0) {
            UI.print('Exits:', 'exits');
            exitDescs.forEach(e => UI.print(e, 'exits'));
        }

        // Update state tracking
        this.gameState.currentRoomName = room.name;
        this.gameState.currentRoomZone = room.zone;
        this.gameState.isCurrentRoomBarricaded = !!room.barricaded;
        UI.updateStatusBar(this.gameState);
        UI.updateInventory(this.gameState);
    },

    processCommand(rawInput) {
        if (this.gameState.currentState === 'GAME_OVER' || this.gameState.currentState === 'VICTORY') {
            if (rawInput.toLowerCase() === 'restart' || rawInput.toLowerCase() === 'new') {
                this.startNewGame();
            }
            return;
        }

        // Build context for parser
        const context = this.buildParserContext();
        const parsed = Parser.parse(rawInput, context);

        if (!parsed.verb) {
            UI.print('I don\'t understand that. Type \'help\' for a list of commands.', 'system');
            return;
        }

        // Route based on game state
        if (this.gameState.currentState === 'COMBAT') {
            this.processCombatCommand(parsed);
            return;
        }

        if (this.gameState.currentState === 'DIALOGUE') {
            this.processDialogueCommand(parsed);
            return;
        }

        // Normal exploring state
        const result = Commands.execute(parsed, this.gameState, this);
        if (!result) {
            UI.print('You can\'t do that right now.', 'system');
            return;
        }

        // Display messages
        if (result.messages) {
            for (const msg of result.messages) {
                if (msg === 'PLAYER_DEATH') {
                    this.handleDeath();
                    return;
                }
                if (msg === 'SURVIVAL_VICTORY') {
                    this.handleSurvivalVictory();
                    return;
                }
                const cssClass = this.getMessageClass(msg);
                UI.print(msg, cssClass);
            }
        }

        // Advance time
        if (result.timeElapsed && result.timeElapsed > 0) {
            const tickMsgs = Survival.tick(this.gameState, result.timeElapsed);
            for (const msg of tickMsgs) {
                if (msg === 'PLAYER_DEATH') {
                    this.handleDeath();
                    return;
                }
                if (msg === 'SURVIVAL_VICTORY') {
                    this.handleSurvivalVictory();
                    return;
                }
                UI.print(msg, this.getMessageClass(msg));
            }
        }

        // Check for events
        const eventMsgs = Events.check(this.gameState);
        for (const msg of eventMsgs) {
            UI.print(msg, this.getMessageClass(msg));
        }

        // Check escape route progress
        const escapeMsgs = EscapeRoutes.check(this.gameState);
        for (const msg of escapeMsgs) {
            if (msg.startsWith('ESCAPE_VICTORY:')) {
                this.handleEscapeVictory(msg.split(':')[1]);
                return;
            }
            UI.print(msg, 'quest');
        }

        // Check for zombie encounter after moving
        if (result.moved) {
            this.checkZombieEncounter();
        }

        // Update UI
        UI.updateStatusBar(this.gameState);
        UI.updateInventory(this.gameState);

        // Check death
        if (this.gameState.player.health <= 0) {
            this.handleDeath();
        }
    },

    processCombatCommand(parsed) {
        const enemy = this.gameState.combat.enemy;
        if (!enemy) {
            this.gameState.currentState = 'EXPLORING';
            return;
        }

        let messages = [];
        let combatOver = false;

        if (parsed.verb === 'attack' || parsed.verb === 'fight') {
            const weapon = this.gameState.player.equippedWeapon;
            const hasCompanion = this.gameState.player.companions.length > 0;
            messages = Combat.playerAttack(enemy, weapon, hasCompanion);

            // Process attack results
            for (const msg of messages) {
                if (msg === 'WEAPON_BROKE') {
                    this.gameState.player.equippedWeapon = null;
                } else if (msg.startsWith('SELF_DAMAGE:')) {
                    const dmg = parseInt(msg.split(':')[1]);
                    this.gameState.player.health -= dmg;
                } else if (msg === 'NOISE_ALERT') {
                    this.gameState.world.zombieAlertLevel = Math.min(10,
                        this.gameState.world.zombieAlertLevel + 0.5);
                } else if (msg === 'ENEMY_DEAD') {
                    combatOver = true;
                    this.gameState.player.kills += enemy.count;
                }
            }

            // Enemy attacks back if still alive
            if (!combatOver) {
                const armor = this.gameState.player.equippedArmor;
                const enemyMsgs = Combat.enemyAttack(enemy, armor, false);
                for (const msg of enemyMsgs) {
                    if (msg.startsWith('PLAYER_DAMAGE:')) {
                        const dmg = parseInt(msg.split(':')[1]);
                        this.gameState.player.health -= dmg;
                    }
                    messages.push(msg);
                }
            }
        } else if (parsed.verb === 'defend') {
            messages.push('You brace yourself and prepare to defend.');
            const armor = this.gameState.player.equippedArmor;
            const enemyMsgs = Combat.enemyAttack(enemy, armor, true);
            for (const msg of enemyMsgs) {
                if (msg.startsWith('PLAYER_DAMAGE:')) {
                    const dmg = parseInt(msg.split(':')[1]);
                    this.gameState.player.health -= dmg;
                }
                messages.push(msg);
            }
        } else if (parsed.verb === 'flee' || parsed.verb === 'go') {
            const result = Combat.tryFlee(enemy, this.gameState.player.hunger);
            messages = result.messages;
            for (const msg of messages) {
                if (msg.startsWith('PLAYER_DAMAGE:')) {
                    const dmg = parseInt(msg.split(':')[1]);
                    this.gameState.player.health -= dmg;
                }
            }
            if (result.success) {
                combatOver = true;
                messages.push('You escape the fight!');
            }
        } else if (parsed.verb === 'use') {
            // Use item in combat (medicine, throwable)
            const result = Commands.executeUse(parsed, this.gameState, this);
            if (result && result.messages) messages = result.messages;
            // Enemy still attacks
            const armor = this.gameState.player.equippedArmor;
            const enemyMsgs = Combat.enemyAttack(enemy, armor, false);
            for (const msg of enemyMsgs) {
                if (msg.startsWith('PLAYER_DAMAGE:')) {
                    const dmg = parseInt(msg.split(':')[1]);
                    this.gameState.player.health -= dmg;
                }
                messages.push(msg);
            }
        } else if (parsed.verb === 'inventory') {
            const result = Commands.execute(parsed, this.gameState, this);
            if (result && result.messages) {
                for (const msg of result.messages) UI.print(msg);
            }
            return;
        } else {
            messages.push('In combat you can: attack, defend, flee, use [item], or check inventory.');
        }

        // Print messages (filter out control codes)
        for (const msg of messages) {
            if (!msg.startsWith('PLAYER_DAMAGE:') && !msg.startsWith('SELF_DAMAGE:') &&
                msg !== 'WEAPON_BROKE' && msg !== 'NOISE_ALERT' && msg !== 'ENEMY_DEAD') {
                UI.print(msg, this.getMessageClass(msg));
            }
        }

        // Advance time for combat round
        const tickMsgs = Survival.tick(this.gameState, 5);
        for (const msg of tickMsgs) {
            if (msg === 'PLAYER_DEATH') { this.handleDeath(); return; }
            UI.print(msg, this.getMessageClass(msg));
        }

        // Check death
        if (this.gameState.player.health <= 0) {
            this.handleDeath();
            return;
        }

        // End combat
        if (combatOver) {
            this.gameState.currentState = 'EXPLORING';
            this.gameState.combat.enemy = null;
            UI.print('The fight is over.', 'system');
            UI.printBlank();
        } else {
            UI.print(Combat.getCombatPrompt(enemy), 'combat-header');
        }

        UI.updateStatusBar(this.gameState);
        UI.updateInventory(this.gameState);
    },

    processDialogueCommand(parsed) {
        const result = NPCs.handleDialogueInput(parsed, this.gameState);
        if (result) {
            for (const msg of result.messages || []) {
                UI.print(msg, this.getMessageClass(msg));
            }
            if (result.endDialogue) {
                this.gameState.currentState = 'EXPLORING';
            }
            if (result.startTrade) {
                this.showTradeMenu(result.npcId);
            }
        }
    },

    showTradeMenu(npcId) {
        const trades = NPCs.getTradeOptions(npcId, this.gameState);
        if (!trades || trades.length === 0) {
            UI.print('They have nothing to trade.', 'npc');
            this.gameState.currentState = 'EXPLORING';
            return;
        }
        UI.print('Available trades:', 'npc');
        trades.forEach((t, i) => {
            UI.print(`  ${i + 1}. ${t.offer} for ${t.price}`, 'npc');
        });
        UI.print('Type a number to trade, or \'leave\' to stop trading.', 'system');
    },

    checkZombieEncounter() {
        const roomId = this.gameState.player.location;
        const room = World.getRoom(roomId);
        if (!room) return;

        const timeMultiplier = Survival.getZombieSpawnMultiplier(this.gameState.world.time.hour);
        const enemy = Combat.trySpawnEncounter(room, this.gameState.world.zombieAlertLevel, timeMultiplier);

        if (enemy) {
            this.startCombat(enemy);
        }
    },

    startCombat(enemy) {
        this.gameState.currentState = 'COMBAT';
        this.gameState.combat.enemy = enemy;
        this.gameState.combat.roundCount = 0;
        this.gameState.combat.isDefending = false;

        UI.printBlank();
        UI.print('=== COMBAT ===', 'combat-header');
        UI.print(Combat.getEncounterIntro(enemy), 'damage');
        if (enemy.description) UI.print(enemy.description, 'narrative');
        UI.printBlank();
        UI.print(Combat.getCombatPrompt(enemy), 'combat-header');

        if (!this.gameState.player.equippedWeapon) {
            UI.print('You have no weapon equipped! Use \'equip [weapon]\' or fight with bare hands.', 'warning');
        }
    },

    handleDeath() {
        this.gameState.currentState = 'GAME_OVER';
        this.gameState.player.health = 0;
        UI.updateStatusBar(this.gameState);
        UI.updateInventory(this.gameState);
        UI.printBlank();

        const deathMessages = [
            'Your vision fades. The cold stone of Paris is the last thing you feel.',
            'You collapse. The city claims another soul.',
            'The darkness takes you. Paris remains, silent and dead.',
            'Your story ends here, in the city of lights gone dark.',
            'You fall. The zombies descend. It is over.'
        ];
        const msg = deathMessages[Math.floor(Math.random() * deathMessages.length)];

        UI.print('========================================', 'damage');
        UI.print('            YOU ARE DEAD', 'damage');
        UI.print('========================================', 'damage');
        UI.printBlank();
        UI.print(msg, 'narrative');
        UI.print(`You survived ${this.gameState.world.time.day - 1} days.`, 'system');
        UI.print(`Kills: ${this.gameState.player.kills}`, 'system');
        UI.printBlank();
        UI.print('Type \'restart\' to try again.', 'system');
    },

    handleSurvivalVictory() {
        this.gameState.currentState = 'VICTORY';
        UI.printBlank();
        UI.print('========================================', 'quest');
        UI.print('           YOU SURVIVED', 'quest');
        UI.print('========================================', 'quest');
        UI.printBlank();
        UI.print('Dawn breaks on Day 30. You hear engines -- real engines.', 'narrative');
        UI.print('Military convoys roll down the Champs-Elysees, soldiers in hazmat', 'narrative');
        UI.print('suits sweeping the streets. A helicopter circles overhead, its', 'narrative');
        UI.print('loudspeaker crackling: "SURVIVORS REPORT TO PLACE DE LA CONCORDE."', 'narrative');
        UI.printBlank();
        UI.print('You stumble out into the light. You made it. Against all odds,', 'narrative');
        UI.print('you survived 30 days in Dead Paris.', 'narrative');
        UI.printBlank();
        UI.print(`Kills: ${this.gameState.player.kills}`, 'system');
        UI.print('Type \'restart\' to play again.', 'system');
    },

    handleEscapeVictory(routeId) {
        this.gameState.currentState = 'VICTORY';
        UI.printBlank();
        UI.print('========================================', 'quest');
        UI.print('            YOU ESCAPED', 'quest');
        UI.print('========================================', 'quest');
        UI.printBlank();

        const victories = {
            seine_boat: [
                'The engine coughs, sputters, then roars to life. You cast off from',
                'the dock as zombies surge down the embankment behind you.',
                'The Seine carries you west, past the Eiffel Tower -- a dark silhouette',
                'against the orange sky. Past the suburbs. Past the horror.',
                'Toward the sea. Toward survival.'
            ],
            airport: [
                'The police car screams down the autoroute, weaving between wrecks.',
                'CDG airport appears on the horizon -- and on the runway, a military',
                'transport plane, engines already turning.',
                'You floor it across the tarmac. The ramp is lowering. Soldiers wave',
                'you aboard. The wheels leave French soil. You\'re free.'
            ],
            catacombs: [
                'After days in the darkness, crawling through tunnels of bone and',
                'limestone, you see it -- daylight. Real daylight.',
                'You emerge into a field south of Paris. The countryside is quiet.',
                'No groaning. No shuffling. Just birdsong and wind.',
                'You walk toward the horizon. Behind you, Paris burns.'
            ],
            helicopter: [
                'The helicopter thunders onto the rooftop terrace, blasting debris',
                'in every direction. You sprint across the Belle Etoile terrace as',
                'zombies pour through the stairwell door behind you.',
                'A soldier grabs your arm and hauls you aboard. The skids lift off.',
                'Below you, Paris spreads out -- beautiful, broken, and dead.',
                'But you are alive.'
            ]
        };

        const lines = victories[routeId] || ['You escaped Dead Paris.'];
        for (const line of lines) {
            UI.print(line, 'narrative');
        }
        UI.printBlank();
        UI.print(`Escaped on Day ${this.gameState.world.time.day}.`, 'system');
        UI.print(`Kills: ${this.gameState.player.kills}`, 'system');
        UI.print('Type \'restart\' to play again.', 'system');
    },

    // Helpers
    buildParserContext() {
        const roomId = this.gameState.player.location;
        const roomItems = World.getRoomItems(roomId);
        const invItems = this.gameState.player.inventory.map(entry => {
            const def = World.getItemDef(entry.id);
            return def || { id: entry.id, name: entry.id };
        });
        const npcsHere = NPCs.getNpcsInRoom(roomId, this.gameState);

        return {
            availableItems: [...roomItems, ...invItems],
            availableExits: World.getRoomExits(roomId),
            availableNpcs: npcsHere
        };
    },

    playerHasLight() {
        return this.gameState.player.inventory.some(entry => {
            const def = World.getItemDef(entry.id);
            return def && def.special && (
                def.special.includes('light_source') ||
                def.special.includes('dim_light')
            );
        });
    },

    groupItems(itemIds) {
        const counts = {};
        const names = {};
        for (const id of itemIds) {
            counts[id] = (counts[id] || 0) + 1;
            if (!names[id]) names[id] = World.getItemName(id);
        }
        return Object.entries(counts)
            .map(([id, count]) => count > 1 ? `${names[id]} (x${count})` : names[id])
            .join(', ');
    },

    getMessageClass(msg) {
        if (msg.includes('damage') || msg.includes('HP)') || msg.includes('takes') ||
            msg.includes('hurt') || msg.includes('starving') || msg.includes('dying')) return 'damage';
        if (msg.includes('[!]') || msg.includes('hungry') || msg.includes('thirsty') ||
            msg.includes('warning') || msg.includes('breaks') || msg.includes('parched')) return 'warning';
        if (msg.includes('---') || msg.includes('Day ')) return 'system';
        return '';
    },

    // Save/Load
    saveGame(slot = 'autosave') {
        const saveData = {
            version: '1.0',
            timestamp: Date.now(),
            player: JSON.parse(JSON.stringify(this.gameState.player)),
            world: JSON.parse(JSON.stringify(this.gameState.world)),
            escapeRoutes: JSON.parse(JSON.stringify(this.gameState.escapeRoutes)),
            combat: { enemy: null, isDefending: false, roundCount: 0 },
            currentState: this.gameState.currentState === 'COMBAT' ? 'EXPLORING' : this.gameState.currentState,
            worldState: World.serialize()
        };
        try {
            localStorage.setItem(`deadparis_${slot}`, JSON.stringify(saveData));
            return true;
        } catch (e) {
            return false;
        }
    },

    loadGame(slot = 'autosave') {
        try {
            const raw = localStorage.getItem(`deadparis_${slot}`);
            if (!raw) return false;
            const saveData = JSON.parse(raw);

            this.gameState = this.createNewGameState();
            Object.assign(this.gameState.player, saveData.player);
            Object.assign(this.gameState.world, saveData.world);
            Object.assign(this.gameState.escapeRoutes, saveData.escapeRoutes);
            this.gameState.currentState = saveData.currentState || 'EXPLORING';

            if (saveData.worldState) {
                World.deserialize(saveData.worldState);
            }

            return true;
        } catch (e) {
            return false;
        }
    },

    listSaves() {
        const saves = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('deadparis_')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    saves.push({
                        slot: key.replace('deadparis_', ''),
                        timestamp: data.timestamp,
                        day: data.world?.time?.day || '?'
                    });
                } catch (e) { /* skip corrupted saves */ }
            }
        }
        return saves;
    }
};

export default Engine;
