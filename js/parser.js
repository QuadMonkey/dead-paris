// ============================================
// DEAD PARIS - Command Parser
// Tokenize input, match verbs/nouns
// ============================================

const VERB_SYNONYMS = {
    go:        ['go', 'walk', 'run', 'move', 'head', 'travel', 'enter'],
    look:      ['look', 'examine', 'inspect', 'check', 'read', 'view'],
    search:    ['search', 'rummage', 'scavenge', 'loot', 'ransack'],
    take:      ['take', 'pick', 'grab', 'get', 'collect'],
    drop:      ['drop', 'discard', 'leave', 'put', 'dump'],
    use:       ['use', 'apply', 'consume', 'eat', 'drink', 'activate'],
    equip:     ['equip', 'wield', 'wear', 'hold'],
    unequip:   ['unequip', 'remove', 'unwield', 'stow'],
    open:      ['open'],
    close:     ['close', 'shut'],
    unlock:    ['unlock'],
    lock:      ['lock'],
    attack:    ['attack', 'fight', 'hit', 'strike', 'kill', 'shoot', 'stab', 'slash', 'swing'],
    defend:    ['defend', 'block', 'guard', 'brace'],
    flee:      ['flee', 'escape', 'retreat', 'run'],
    talk:      ['talk', 'speak', 'ask', 'chat', 'greet', 'hail'],
    trade:     ['trade', 'barter', 'buy', 'sell', 'swap'],
    give:      ['give', 'offer', 'hand'],
    inventory: ['inventory', 'inv', 'items', 'bag'],
    help:      ['help', 'commands'],
    wait:      ['wait', 'rest', 'sleep', 'hide', 'camp'],
    barricade: ['barricade', 'fortify', 'block', 'board'],
    save:      ['save'],
    load:      ['load', 'restore'],
    status:    ['status', 'stats', 'health', 'hp', 'me'],
    map:       ['map'],
    quit:      ['quit', 'exit']
};

const DIRECTION_MAP = {
    north: 'north', n: 'north',
    south: 'south', s: 'south',
    east: 'east', e: 'east', right: 'east',
    west: 'west', w: 'west', left: 'west',
    up: 'up', upstairs: 'up', ascend: 'up', climb: 'up',
    down: 'down', downstairs: 'down', descend: 'down',
    inside: 'inside', in: 'inside',
    outside: 'outside', out: 'outside',
    northeast: 'northeast', ne: 'northeast',
    northwest: 'northwest', nw: 'northwest',
    southeast: 'southeast', se: 'southeast',
    southwest: 'southwest', sw: 'southwest'
};

const SHORTCUT_COMMANDS = {
    'n': { verb: 'go', noun: 'north' },
    's': { verb: 'go', noun: 'south' },
    'e': { verb: 'go', noun: 'east' },
    'w': { verb: 'go', noun: 'west' },
    'u': { verb: 'go', noun: 'up' },
    'd': { verb: 'go', noun: 'down' },
    'i': { verb: 'inventory', noun: null },
    'l': { verb: 'look', noun: null },
    'h': { verb: 'help', noun: null },
    '?': { verb: 'help', noun: null },
    'x': { verb: 'look', noun: null }
};

const ARTICLES = new Set(['the', 'a', 'an', 'some', 'this', 'that', 'my']);
const PREPOSITIONS = new Set(['to', 'at', 'on', 'in', 'with', 'from', 'into', 'onto', 'under', 'behind', 'through']);

const Parser = {
    parse(input, context = {}) {
        const raw = input.trim().toLowerCase();
        if (!raw) return { verb: null, noun: null, modifier: null, raw };

        // Check single-character shortcuts
        if (SHORTCUT_COMMANDS[raw]) {
            return { ...SHORTCUT_COMMANDS[raw], modifier: null, raw };
        }

        // Tokenize
        const tokens = raw.split(/\s+/).filter(t => t.length > 0);

        // Remove articles
        const filtered = tokens.filter(t => !ARTICLES.has(t));
        if (filtered.length === 0) return { verb: null, noun: null, modifier: null, raw };

        // Check if first word is a direction (implicit "go")
        if (DIRECTION_MAP[filtered[0]] && filtered.length === 1) {
            return { verb: 'go', noun: DIRECTION_MAP[filtered[0]], modifier: null, raw };
        }

        // Resolve verb
        const verbWord = filtered[0];
        let verb = this.resolveVerb(verbWord);

        // Special: "pick up" -> "take"
        if (verbWord === 'pick' && filtered[1] === 'up') {
            verb = 'take';
            filtered.splice(1, 1);
        }

        // Special: "look at" -> "look"
        if (verb === 'look' && filtered[1] === 'at') {
            filtered.splice(1, 1);
        }

        if (!verb) {
            // Maybe it's a noun they want to look at or go to
            const possibleRoom = this.resolveLocationName(raw, context);
            if (possibleRoom) {
                return { verb: 'go', noun: possibleRoom, modifier: null, raw };
            }
            return { verb: null, noun: raw, modifier: null, raw };
        }

        // Remaining tokens after verb
        const rest = filtered.slice(1);

        // Find preposition to split noun and modifier
        let noun = null;
        let modifier = null;
        let prepIndex = -1;

        for (let i = 0; i < rest.length; i++) {
            if (PREPOSITIONS.has(rest[i]) && i > 0) {
                prepIndex = i;
                break;
            }
        }

        if (prepIndex > 0) {
            noun = rest.slice(0, prepIndex).join(' ');
            modifier = rest.slice(prepIndex + 1).join(' ');
        } else if (rest.length > 0) {
            // Check if it's a direction
            const joined = rest.join(' ');
            if (verb === 'go' && DIRECTION_MAP[rest[0]]) {
                noun = DIRECTION_MAP[rest[0]];
            } else {
                noun = joined;
            }
        }

        // For "go" commands, try to resolve location names
        if (verb === 'go' && noun && !DIRECTION_MAP[noun]) {
            const resolved = this.resolveLocationName(noun, context);
            if (resolved) noun = resolved;
        }

        // For item-related verbs, try to resolve item names (skip special keywords)
        if (['take', 'drop', 'use', 'equip', 'unequip', 'give', 'look'].includes(verb) && noun && noun !== 'all' && noun !== 'everything') {
            const resolvedItem = this.resolveItemName(noun, context);
            if (resolvedItem) noun = resolvedItem;
        }
        if (modifier) {
            const resolvedMod = this.resolveItemName(modifier, context);
            if (resolvedMod) modifier = resolvedMod;
        }

        // For "talk" commands, resolve NPC names
        if (['talk', 'trade', 'give'].includes(verb) && noun) {
            const resolvedNpc = this.resolveNpcName(noun, context);
            if (resolvedNpc) noun = resolvedNpc;
        }

        return { verb, noun, modifier, raw };
    },

    resolveVerb(word) {
        for (const [canonical, synonyms] of Object.entries(VERB_SYNONYMS)) {
            if (synonyms.includes(word)) return canonical;
        }
        return null;
    },

    resolveItemName(name, context) {
        if (!context.availableItems) return name;
        const lower = name.toLowerCase();

        // Exact match on item ID
        const exact = context.availableItems.find(item => item.id === lower);
        if (exact) return exact.id;

        // Match on display name
        const byName = context.availableItems.find(item =>
            item.name.toLowerCase() === lower
        );
        if (byName) return byName.id;

        // Partial match on name
        const partial = context.availableItems.find(item =>
            item.name.toLowerCase().includes(lower) ||
            lower.includes(item.name.toLowerCase())
        );
        if (partial) return partial.id;

        // Match on keywords
        const keywords = lower.split(/\s+/);
        const byKeyword = context.availableItems.find(item => {
            const itemWords = item.name.toLowerCase().split(/\s+/);
            return keywords.some(kw => itemWords.some(iw => iw.includes(kw) || kw.includes(iw)));
        });
        if (byKeyword) return byKeyword.id;

        return name;
    },

    resolveLocationName(name, context) {
        if (!context.availableExits) return null;
        const lower = name.toLowerCase().replace(/\s+/g, '');

        for (const [dir, exit] of Object.entries(context.availableExits)) {
            // Exact match on exit key (with spaces collapsed)
            if (dir.toLowerCase() === lower) return dir;
            // Match on room ID
            if (exit.roomId && exit.roomId.toLowerCase().replace(/\s+/g, '') === lower) return dir;
            // Match on description
            const desc = (exit.description || '').toLowerCase();
            if (desc.includes(name.toLowerCase()) || name.toLowerCase().includes(desc)) return dir;
        }
        return null;
    },

    resolveNpcName(name, context) {
        if (!context.availableNpcs) return name;
        const lower = name.toLowerCase();
        const npc = context.availableNpcs.find(n =>
            n.id === lower ||
            n.name.toLowerCase() === lower ||
            n.name.toLowerCase().includes(lower)
        );
        return npc ? npc.id : name;
    },

    isDirection(word) {
        return !!DIRECTION_MAP[word];
    },

    getDirectionMap() {
        return { ...DIRECTION_MAP };
    }
};

export default Parser;
