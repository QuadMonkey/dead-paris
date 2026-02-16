// ============================================
// DEAD PARIS - NPC System
// Dialogue, trading, recruitment
// ============================================

import World from './world.js';
import Survival from './survival.js';

const NPCs = {
    npcData: [],
    activeDialogue: null,
    activeNpcId: null,

    init(npcsData) {
        this.npcData = npcsData;
    },

    getNpcDef(npcId) {
        return this.npcData.find(n => n.id === npcId);
    },

    getNpcsInRoom(roomId, gameState) {
        const day = gameState.world.time.day;
        const hour = gameState.world.time.hour;
        const isNight = Survival.isNight(hour);

        return this.npcData.filter(npc => {
            if (npc.location !== roomId) return false;
            if (npc.appearsOnDay && day < npc.appearsOnDay) return false;
            if (npc.nightOnly && !isNight) return false;
            // If recruited, they follow the player (always present)
            if (gameState.player.companions.includes(npc.id)) return true;
            return true;
        });
    },

    startDialogue(npcId, gameState) {
        const npc = this.getNpcDef(npcId);
        if (!npc) return null;

        this.activeNpcId = npcId;
        this.activeDialogue = 'root';

        const messages = [];
        messages.push(npc.greeting);
        messages.push('');

        // Show options
        const node = npc.dialogue.root;
        const options = this.getAvailableOptions(node, gameState);
        options.forEach((opt, i) => {
            messages.push(`  ${i + 1}. ${opt.text}`);
        });

        return { messages };
    },

    handleDialogueInput(parsed, gameState) {
        if (!this.activeNpcId || !this.activeDialogue) {
            return { messages: ['No conversation active.'], endDialogue: true };
        }

        const npc = this.getNpcDef(this.activeNpcId);
        if (!npc) return { messages: ['Error.'], endDialogue: true };

        const node = npc.dialogue[this.activeDialogue];
        if (!node) return { messages: ['The conversation ends.'], endDialogue: true };

        const options = this.getAvailableOptions(node, gameState);

        // Parse input as number or text
        let choiceIdx = -1;
        const num = parseInt(parsed.raw);
        if (!isNaN(num) && num >= 1 && num <= options.length) {
            choiceIdx = num - 1;
        } else if (parsed.raw === 'leave' || parsed.raw === 'bye' || parsed.raw === 'goodbye' || parsed.verb === 'quit') {
            return { messages: ['You end the conversation.'], endDialogue: true };
        } else {
            // Try matching text
            const lower = parsed.raw.toLowerCase();
            choiceIdx = options.findIndex(o => o.text.toLowerCase().includes(lower));
        }

        if (choiceIdx < 0 || choiceIdx >= options.length) {
            const msgs = ['Choose an option:'];
            options.forEach((opt, i) => msgs.push(`  ${i + 1}. ${opt.text}`));
            return { messages: msgs };
        }

        const choice = options[choiceIdx];
        if (!choice.next) {
            // End dialogue
            this.activeDialogue = null;
            this.activeNpcId = null;
            return { messages: ['You end the conversation.'], endDialogue: true };
        }

        // Navigate to next node
        const nextNode = npc.dialogue[choice.next];
        if (!nextNode) {
            this.activeDialogue = null;
            this.activeNpcId = null;
            return { messages: ['The conversation ends.'], endDialogue: true };
        }

        this.activeDialogue = choice.next;
        const messages = [];

        // NPC response text
        if (nextNode.text) {
            messages.push(nextNode.text);
        }

        // Apply effects
        if (nextNode.setsFlag) {
            gameState.player.questFlags[nextNode.setsFlag] = true;
        }

        if (nextNode.givesItem) {
            const itemDef = World.getItemDef(nextNode.givesItem);
            const existing = gameState.player.inventory.find(i => i.id === nextNode.givesItem);
            if (!existing) {
                gameState.player.inventory.push({ id: nextNode.givesItem, quantity: 1 });
                gameState.player.currentWeight += (itemDef?.weight || 0);
                messages.push(`[Received: ${itemDef?.name || nextNode.givesItem}]`);
            }
        }

        if (nextNode.consumesItem) {
            const idx = gameState.player.inventory.findIndex(i => i.id === nextNode.consumesItem);
            if (idx >= 0) {
                const entry = gameState.player.inventory[idx];
                const def = World.getItemDef(entry.id);
                if (entry.quantity > 1) {
                    entry.quantity--;
                } else {
                    gameState.player.inventory.splice(idx, 1);
                }
                gameState.player.currentWeight -= (def?.weight || 0);
                messages.push(`[Given: ${def?.name || nextNode.consumesItem}]`);
            }
        }

        if (nextNode.recruits) {
            if (!gameState.player.companions.includes(this.activeNpcId)) {
                gameState.player.companions.push(this.activeNpcId);
                messages.push(`[${npc.name} has joined you!]`);
            }
        }

        if (nextNode.startsTrade) {
            this.activeDialogue = null;
            return { messages, startTrade: true, npcId: this.activeNpcId };
        }

        // Show next options
        const nextOptions = this.getAvailableOptions(nextNode, gameState);
        if (nextOptions.length === 0) {
            this.activeDialogue = null;
            this.activeNpcId = null;
            messages.push('');
            messages.push('The conversation ends.');
            return { messages, endDialogue: true };
        }

        messages.push('');
        nextOptions.forEach((opt, i) => {
            messages.push(`  ${i + 1}. ${opt.text}`);
        });

        return { messages };
    },

    getAvailableOptions(node, gameState) {
        if (!node || !node.options) return [];
        return node.options.filter(opt => {
            if (opt.requires) {
                return gameState.player.inventory.some(i => i.id === opt.requires);
            }
            return true;
        });
    },

    getTradeOptions(npcId, gameState) {
        const npc = this.getNpcDef(npcId);
        if (!npc || !npc.tradeInventory) return [];

        return npc.tradeInventory.map(trade => ({
            offer: `${World.getItemName(trade.give)} x${trade.giveQty}`,
            price: `${World.getItemName(trade.want)} x${trade.wantQty}`,
            trade
        }));
    },

    executeTrade(npcId, tradeIndex, gameState) {
        const npc = this.getNpcDef(npcId);
        if (!npc || !npc.tradeInventory[tradeIndex]) return null;

        const trade = npc.tradeInventory[tradeIndex];

        // Check player has the want items
        const playerHas = gameState.player.inventory.find(i => i.id === trade.want);
        if (!playerHas || (playerHas.quantity || 1) < trade.wantQty) {
            return { messages: [`You don't have enough ${World.getItemName(trade.want)}.`] };
        }

        // Remove want items from player
        for (let i = 0; i < trade.wantQty; i++) {
            const idx = gameState.player.inventory.findIndex(it => it.id === trade.want);
            if (idx >= 0) {
                const entry = gameState.player.inventory[idx];
                if (entry.quantity > 1) {
                    entry.quantity--;
                } else {
                    gameState.player.inventory.splice(idx, 1);
                }
                const def = World.getItemDef(trade.want);
                gameState.player.currentWeight -= (def?.weight || 0);
            }
        }

        // Add give items to player
        for (let i = 0; i < trade.giveQty; i++) {
            const existing = gameState.player.inventory.find(it => it.id === trade.give);
            const def = World.getItemDef(trade.give);
            if (existing && def?.stackable) {
                existing.quantity = (existing.quantity || 1) + 1;
            } else {
                gameState.player.inventory.push({ id: trade.give, quantity: 1 });
            }
            gameState.player.currentWeight += (def?.weight || 0);
        }

        return {
            messages: [`Trade complete! Received ${World.getItemName(trade.give)} x${trade.giveQty}.`]
        };
    },

    giveItem(npcId, itemId, gameState) {
        const npc = this.getNpcDef(npcId);
        if (!npc) return null;

        // Special: give antibiotics to Moreau
        if (npcId === 'sergent_moreau' && itemId === 'antibiotics') {
            gameState.player.questFlags.moreau_healed = true;
            return {
                messages: [
                    'Sergent Moreau takes the antibiotics gratefully.',
                    '"Thank God. Give these a few hours and I\'ll be back on my feet."',
                    '"A deal\'s a deal. Ask me anything."'
                ]
            };
        }

        return null;
    },

    getCompanionBonus(gameState) {
        const bonuses = { healing: 0, combat: 0 };
        for (const compId of gameState.player.companions) {
            const npc = this.getNpcDef(compId);
            if (npc?.companionBonus) {
                if (npc.companionBonus.type === 'healing') {
                    bonuses.healing += npc.companionBonus.bonus;
                }
                if (npc.companionBonus.type === 'combat') {
                    bonuses.combat += npc.companionBonus.bonus;
                }
            }
        }
        return bonuses;
    }
};

export default NPCs;
