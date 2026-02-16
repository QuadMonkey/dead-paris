// ============================================
// DEAD PARIS - Survival System
// Hunger, thirst, health, day/night cycle
// ============================================

const Survival = {
    // Advance time and apply survival effects
    tick(gameState, minutesElapsed) {
        const messages = [];
        const t = gameState.world.time;
        const p = gameState.player;

        let totalMinutes = t.minute + minutesElapsed;
        let hoursElapsed = 0;

        while (totalMinutes >= 60) {
            totalMinutes -= 60;
            hoursElapsed++;
        }
        t.minute = totalMinutes;

        // Process each hour that passed
        for (let h = 0; h < hoursElapsed; h++) {
            const prevHour = t.hour;
            t.hour++;

            if (t.hour >= 24) {
                t.hour -= 24;
                t.day++;
                gameState.world.zombieAlertLevel = Math.min(10, gameState.world.zombieAlertLevel + 0.3);
                messages.push(`--- Day ${t.day} ---`);

                if (t.day > 30) {
                    messages.push('SURVIVAL_VICTORY');
                    return messages;
                }
            }

            // Day/night transition messages
            if (prevHour === 5 && t.hour === 6) {
                messages.push('Dawn breaks over Paris. The first light reveals the damage of another night.');
            } else if (prevHour === 18 && t.hour === 19) {
                messages.push('Dusk settles over the city. The shadows grow long.');
            } else if (prevHour === 20 && t.hour === 21) {
                messages.push('Night falls. The groaning from the streets grows louder.');
            }

            // Hunger decreases every hour
            p.hunger = Math.max(0, p.hunger - 1);

            // Thirst decreases 1.5 per hour (alternates 1 and 2)
            const thirstDec = (t.hour % 2 === 0) ? 2 : 1;
            p.thirst = Math.max(0, p.thirst - thirstDec);

            // Hunger warnings and damage
            if (p.hunger <= 0) {
                p.health -= 3;
                messages.push('You are starving! Your body is failing. (-3 HP)');
            } else if (p.hunger <= 20) {
                p.health -= 1;
                messages.push('You are very hungry. Your stomach cramps painfully. (-1 HP)');
            } else if (p.hunger === 40) {
                messages.push('You feel weak with hunger. You should eat something.');
            }

            // Thirst warnings and damage
            if (p.thirst <= 0) {
                p.health -= 4;
                messages.push('You are dying of thirst! Your vision blurs. (-4 HP)');
            } else if (p.thirst <= 10) {
                p.health -= 2;
                messages.push('You are severely dehydrated. Every movement is agony. (-2 HP)');
            } else if (p.thirst <= 30) {
                p.health -= 1;
                messages.push('Your mouth is parched. You desperately need water. (-1 HP)');
            } else if (p.thirst === 50) {
                messages.push('Your throat is dry. You should find something to drink.');
            }

            // Health can't go below 0
            if (p.health <= 0) {
                p.health = 0;
                messages.push('PLAYER_DEATH');
                return messages;
            }
        }

        return messages;
    },

    // Apply food consumption
    eat(gameState, itemDef) {
        const p = gameState.player;
        const messages = [];

        if (itemDef.hungerRelief) {
            p.hunger = Math.min(100, p.hunger + itemDef.hungerRelief);
            messages.push(itemDef.useMessage || `You eat the ${itemDef.name}. Hunger restored by ${itemDef.hungerRelief}.`);
        }
        if (itemDef.thirstRelief) {
            p.thirst = Math.min(100, p.thirst + itemDef.thirstRelief);
            messages.push(`Thirst restored by ${itemDef.thirstRelief}.`);
        }
        if (itemDef.healing) {
            p.health = Math.min(p.maxHealth, p.health + itemDef.healing);
            messages.push(`Health restored by ${itemDef.healing}.`);
        }

        // Special effects
        if (itemDef.special) {
            if (itemDef.special.includes('slight_blur')) {
                messages.push('The alcohol warms you but dulls your senses.');
            }
            if (itemDef.special.includes('sickness')) {
                if (Math.random() < 0.15) {
                    const sicknessHp = 10;
                    p.health -= sicknessHp;
                    messages.push(`The meat makes you sick. You vomit. (-${sicknessHp} HP)`);
                }
            }
        }

        return messages;
    },

    // Apply medicine
    heal(gameState, itemDef) {
        const p = gameState.player;
        const messages = [];

        if (itemDef.healing) {
            const before = p.health;
            p.health = Math.min(p.maxHealth, p.health + itemDef.healing);
            const healed = p.health - before;
            messages.push(itemDef.useMessage || `You use the ${itemDef.name}. Health restored by ${healed}.`);
        }

        if (itemDef.special && itemDef.special.includes('cures_infection')) {
            if (gameState.player.infected) {
                gameState.player.infected = false;
                messages.push('The antibiotics clear the infection. You feel much better.');
            }
        }

        return messages;
    },

    // Rest/sleep action
    rest(gameState, hours) {
        const messages = [];
        const p = gameState.player;
        const isBarricaded = gameState.isCurrentRoomBarricaded;
        const zone = gameState.currentRoomZone;

        // Can only rest safely in certain conditions
        if (zone === 'exterior' && !isBarricaded) {
            messages.push('You try to rest, but the open streets are too dangerous. You manage only fitful dozing.');
            hours = Math.min(hours, 2);
        }

        // Heal slightly while resting
        const healPerHour = isBarricaded ? 3 : 1;
        const totalHeal = healPerHour * hours;
        p.health = Math.min(p.maxHealth, p.health + totalHeal);

        if (hours >= 4) {
            messages.push(`You sleep for ${hours} hours. (+${totalHeal} HP)`);
        } else {
            messages.push(`You rest for ${hours} hours. (+${totalHeal} HP)`);
        }

        // Time advances (hunger/thirst handled by tick)
        const tickMessages = this.tick(gameState, hours * 60);
        messages.push(...tickMessages);

        return messages;
    },

    getTimeOfDay(hour) {
        if (hour >= 6 && hour < 19) return 'day';
        if (hour >= 19 && hour < 21) return 'dusk';
        return 'night';
    },

    isNight(hour) {
        return hour >= 21 || hour < 6;
    },

    isDusk(hour) {
        return hour >= 19 && hour < 21;
    },

    getZombieSpawnMultiplier(hour) {
        if (this.isNight(hour)) return 2.0;
        if (this.isDusk(hour)) return 1.5;
        return 1.0;
    },

    getStatusText(gameState) {
        const p = gameState.player;
        const lines = [];
        lines.push(`Health: ${p.health}/${p.maxHealth}`);
        lines.push(`Hunger: ${p.hunger}/100${p.hunger <= 40 ? ' [!]' : ''}`);
        lines.push(`Thirst: ${p.thirst}/100${p.thirst <= 50 ? ' [!]' : ''}`);
        lines.push(`Day: ${gameState.world.time.day}/30`);
        lines.push(`Time: ${String(gameState.world.time.hour).padStart(2, '0')}:${String(gameState.world.time.minute).padStart(2, '0')}`);
        lines.push(`Zombie Alert Level: ${gameState.world.zombieAlertLevel.toFixed(1)}/10`);
        lines.push(`Days survived: ${gameState.world.time.day - 1}`);
        lines.push(`Kills: ${p.kills}`);
        if (p.equippedWeapon) lines.push(`Weapon: ${p.equippedWeapon.name}`);
        if (p.equippedArmor) lines.push(`Armor: ${p.equippedArmor.name}`);
        if (p.companions && p.companions.length > 0) {
            lines.push(`Companions: ${p.companions.join(', ')}`);
        }
        return lines;
    }
};

export default Survival;
