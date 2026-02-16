// ============================================
// DEAD PARIS - Events System
// Random encounters + scripted story events
// ============================================

import World from './world.js';
import Survival from './survival.js';

const Events = {
    eventsData: null,
    firedEvents: new Set(),
    lastRandomCheck: 0,

    init(eventsData) {
        this.eventsData = eventsData;
        this.firedEvents = new Set();
        this.lastRandomCheck = 0;
    },

    check(gameState) {
        const messages = [];

        // Check scripted events
        const scriptedMsgs = this.checkScripted(gameState);
        messages.push(...scriptedMsgs);

        // Check random events (throttled - once per 30 game minutes)
        const currentTime = gameState.world.time.day * 1440 + gameState.world.time.hour * 60 + gameState.world.time.minute;
        if (currentTime - this.lastRandomCheck >= 30) {
            this.lastRandomCheck = currentTime;
            const randomMsgs = this.checkRandom(gameState);
            messages.push(...randomMsgs);
        }

        return messages;
    },

    checkScripted(gameState) {
        if (!this.eventsData?.scripted) return [];
        const messages = [];
        const day = gameState.world.time.day;
        const hour = gameState.world.time.hour;

        for (const event of this.eventsData.scripted) {
            if (event.once && this.firedEvents.has(event.id)) continue;
            if (event.day !== day) continue;
            if (event.hour !== undefined && hour < event.hour) continue;

            // Check flag requirements
            if (event.flag && !gameState.player.questFlags[event.flag]) {
                // For radio_static, also check inventory
                if (event.flag === 'has_radio_parts') {
                    const hasRadioParts = gameState.player.inventory.some(i => i.id === 'radio_parts');
                    if (!hasRadioParts) continue;
                } else {
                    continue;
                }
            }

            // Fire event
            this.firedEvents.add(event.id);
            messages.push('');
            messages.push(...event.messages);

            // Apply effects
            if (event.effect) {
                if (event.effect.alertIncrease) {
                    gameState.world.zombieAlertLevel = Math.min(10,
                        gameState.world.zombieAlertLevel + event.effect.alertIncrease);
                }
            }
        }

        return messages;
    },

    checkRandom(gameState) {
        if (!this.eventsData?.random) return [];
        const messages = [];
        const hour = gameState.world.time.hour;
        const timeOfDay = Survival.getTimeOfDay(hour);
        const roomId = gameState.player.location;
        const zone = World.getRoomZone(roomId);

        for (const event of this.eventsData.random) {
            if (Math.random() > event.chance) continue;

            // Check conditions
            const cond = event.conditions || {};
            if (cond.timeOfDay && cond.timeOfDay !== timeOfDay) continue;
            if (cond.zone && cond.zone !== zone) continue;
            if (cond.minDay && gameState.world.time.day < cond.minDay) continue;

            // Pick message (variants or standard)
            if (event.variants) {
                const variant = event.variants[Math.floor(Math.random() * event.variants.length)];
                messages.push('');
                messages.push(variant);
            } else {
                messages.push('');
                messages.push(...event.messages);
            }

            // Apply effects
            if (event.effect) {
                if (event.effect.alertIncrease) {
                    gameState.world.zombieAlertLevel = Math.min(10,
                        gameState.world.zombieAlertLevel + event.effect.alertIncrease);
                }
                if (event.effect.hungerIncrease) {
                    gameState.player.hunger = Math.min(100,
                        gameState.player.hunger + event.effect.hungerIncrease);
                }
                if (event.effect.addItems) {
                    // Add items to current room
                    for (const itemId of event.effect.addItems) {
                        World.addItemToRoom(roomId, itemId);
                    }
                    messages.push('You notice supplies scattered nearby!');
                }
            }

            // Only one random event per check
            break;
        }

        return messages;
    },

    // Serialization for save/load
    serialize() {
        return Array.from(this.firedEvents);
    },

    deserialize(data) {
        this.firedEvents = new Set(data || []);
    }
};

export default Events;
