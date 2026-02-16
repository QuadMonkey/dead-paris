// ============================================
// DEAD PARIS - Combat System
// Turn-based zombie combat
// ============================================

const Combat = {
    enemyTypes: {},

    init(enemiesData) {
        this.enemyTypes = {};
        for (const enemy of enemiesData) {
            this.enemyTypes[enemy.id] = enemy;
        }
    },

    // Spawn a zombie encounter for a room
    trySpawnEncounter(room, alertLevel, timeMultiplier) {
        if (!room.zombies || room.barricaded) return null;

        const baseChance = room.zombies.spawnChance || 0;
        const adjustedChance = baseChance * timeMultiplier * (1 + alertLevel * 0.1);

        if (Math.random() > adjustedChance) return null;

        // Pick a zombie type from room's type list
        const types = room.zombies.types || ['shambler'];
        const typeId = types[Math.floor(Math.random() * types.length)];
        const typeDef = this.enemyTypes[typeId];
        if (!typeDef) return null;

        // Determine count (1 to maxCount)
        const maxCount = room.zombies.maxCount || 1;
        const count = Math.min(maxCount, Math.floor(Math.random() * maxCount) + 1);

        // Create enemy instance
        const hp = this.randomRange(typeDef.hpRange[0], typeDef.hpRange[1]);
        return {
            typeId,
            name: count > 1 ? `${count} ${typeDef.namePlural}` : typeDef.name,
            hp,
            maxHp: hp,
            count,
            damage: typeDef.damage,
            speed: typeDef.speed,
            special: typeDef.special || [],
            description: typeDef.description,
            xp: typeDef.xp || 0
        };
    },

    // Player attacks enemy
    playerAttack(enemy, weapon, hasCompanion) {
        const messages = [];
        let damage = 0;

        if (weapon) {
            damage = this.randomRange(weapon.damage[0], weapon.damage[1]);

            // Companion bonus
            if (hasCompanion) {
                const companionDmg = Math.floor(damage * 0.3);
                damage += companionDmg;
                messages.push(`Your companion attacks alongside you! (+${companionDmg} damage)`);
            }

            messages.push(`You strike the ${enemy.name} with your ${weapon.name} for ${damage} damage!`);

            // Weapon durability
            if (weapon.durability > 0) {
                weapon.currentDurability = (weapon.currentDurability || weapon.durability) - 1;
                if (weapon.currentDurability <= 0) {
                    messages.push(weapon.breakMessage || `Your ${weapon.name} breaks!`);
                    messages.push('WEAPON_BROKE');
                } else if (weapon.currentDurability <= 3) {
                    messages.push(`Your ${weapon.name} is about to break!`);
                }
            }

            // Glass shard self-damage
            if (weapon.special && weapon.special.includes('self_damage')) {
                const selfDmg = this.randomRange(1, 2);
                messages.push(`The glass cuts your hand. (-${selfDmg} HP)`);
                messages.push(`SELF_DAMAGE:${selfDmg}`);
            }

            // Noise from ranged weapons
            if (weapon.special && weapon.special.includes('noise_maker')) {
                messages.push('The gunshot echoes through the streets. That will attract attention...');
                messages.push('NOISE_ALERT');
            }
        } else {
            // Bare hands
            damage = this.randomRange(2, 5);
            messages.push(`You punch the ${enemy.name} for ${damage} damage. You need a weapon!`);
        }

        enemy.hp -= damage;

        if (enemy.hp <= 0) {
            messages.push(`The ${enemy.name} collapses!`);

            // Bloater explosion
            if (enemy.special.includes('explodes_on_death')) {
                const explosionDmg = this.randomRange(8, 15);
                messages.push(`The bloated corpse EXPLODES in a shower of putrid flesh! (-${explosionDmg} HP)`);
                messages.push(`SELF_DAMAGE:${explosionDmg}`);
            }

            messages.push('ENEMY_DEAD');
        } else {
            // Regeneration for le_revenant
            if (enemy.special.includes('regenerates')) {
                const regen = 3;
                enemy.hp = Math.min(enemy.maxHp, enemy.hp + regen);
                messages.push(`The creature's wounds begin to close... (+${regen} HP to enemy)`);
            }

            const pct = Math.floor((enemy.hp / enemy.maxHp) * 100);
            if (pct > 60) messages.push(`The ${enemy.name} staggers but keeps coming.`);
            else if (pct > 30) messages.push(`The ${enemy.name} is badly wounded but still fighting.`);
            else messages.push(`The ${enemy.name} is barely standing, dragging itself forward.`);
        }

        return messages;
    },

    // Enemy attacks player
    enemyAttack(enemy, playerArmor, isDefending) {
        const messages = [];
        let damage = this.randomRange(enemy.damage[0], enemy.damage[1]);

        // Multiply by count if group
        if (enemy.count > 1) {
            damage = Math.floor(damage * (1 + (enemy.count - 1) * 0.4));
        }

        // Armor reduction
        if (playerArmor && playerArmor.damageReduction) {
            damage = Math.max(1, damage - playerArmor.damageReduction);
        }

        // Defend halves damage
        if (isDefending) {
            damage = Math.max(1, Math.floor(damage / 2));
            messages.push(`You brace yourself. The ${enemy.name} attacks!`);
        } else {
            messages.push(`The ${enemy.name} lunges at you!`);
        }

        // Ambush special (crawler)
        if (enemy.special.includes('ambush') && !isDefending && Math.random() < 0.3) {
            damage = Math.floor(damage * 1.5);
            messages.push('It catches you off guard from below!');
        }

        messages.push(`You take ${damage} damage!`);
        messages.push(`PLAYER_DAMAGE:${damage}`);

        return messages;
    },

    // Attempt to flee
    tryFlee(enemy, playerHunger) {
        let chance = 0.6;

        // Speed modifiers
        if (enemy.speed === 'fast') chance -= 0.3;
        else if (enemy.speed === 'very_slow') chance += 0.2;
        else if (enemy.speed === 'slow') chance += 0.1;

        // Can't flee from hordes
        if (enemy.special.includes('no_flee')) {
            return { success: false, messages: ['There are too many of them! You can\'t escape!'] };
        }

        // Hunger penalty
        if (playerHunger > 60) chance -= 0.1;

        if (Math.random() < chance) {
            return { success: true, messages: ['You manage to break free and retreat!'] };
        } else {
            const messages = ['You try to run but the zombie blocks your path!'];
            // Failed flee = free enemy attack
            const dmg = this.randomRange(enemy.damage[0], enemy.damage[1]);
            messages.push(`It catches you as you turn! You take ${dmg} damage!`);
            messages.push(`PLAYER_DAMAGE:${dmg}`);
            return { success: false, messages };
        }
    },

    // Get combat intro text
    getEncounterIntro(enemy) {
        const intros = [
            `A ${enemy.name} lurches out of the shadows!`,
            `You hear a wet gurgling sound. A ${enemy.name} appears!`,
            `The stench hits you first. Then you see it -- a ${enemy.name}!`,
            `Something moves in the darkness. A ${enemy.name} shambles toward you!`,
            `A ${enemy.name} blocks your path, dead eyes fixed on you.`
        ];
        return intros[Math.floor(Math.random() * intros.length)];
    },

    getCombatPrompt(enemy) {
        return `[COMBAT] ${enemy.name} (HP: ${enemy.hp}/${enemy.maxHp}) | attack | defend | flee | use [item]`;
    },

    randomRange(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
};

export default Combat;
