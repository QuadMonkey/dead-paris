// ============================================
// DEAD PARIS - World Manager
// Room loading, connections, item placement
// ============================================

const World = {
    rooms: {},
    items: {},
    itemIndex: {},

    init(hotelData, parisData, itemsData) {
        // Build room index
        this.rooms = {};
        for (const room of hotelData) {
            this.rooms[room.id] = { ...room, visitCount: 0 };
        }
        for (const room of parisData) {
            this.rooms[room.id] = { ...room, visitCount: 0 };
        }

        // Build item definition index
        this.itemIndex = {};
        for (const item of itemsData) {
            this.itemIndex[item.id] = item;
        }
    },

    getRoom(roomId) {
        return this.rooms[roomId] || null;
    },

    getRoomDescription(roomId, timeOfDay, isFirstVisit) {
        const room = this.rooms[roomId];
        if (!room) return 'You see nothing. This place doesn\'t exist.';

        const desc = room.description;
        if (isFirstVisit && desc.firstVisit) return desc.firstVisit;
        if (timeOfDay === 'night' && desc.night) return desc.night;
        if (room.searched && desc.searched) return desc.searched;
        return desc.default;
    },

    getRoomExits(roomId) {
        const room = this.rooms[roomId];
        if (!room) return {};
        return room.exits || {};
    },

    getExitDescription(roomId) {
        const exits = this.getRoomExits(roomId);
        const descriptions = [];
        for (const [dir, exit] of Object.entries(exits)) {
            const lockStr = exit.locked ? ' [LOCKED]' : '';
            descriptions.push(`  ${dir}: ${exit.description}${lockStr}`);
        }
        return descriptions;
    },

    getRoomItems(roomId) {
        const room = this.rooms[roomId];
        if (!room || !room.items) return [];
        return room.items.map(id => {
            const def = this.itemIndex[id];
            return def ? { ...def } : { id, name: id, type: 'unknown' };
        });
    },

    getRoomItemIds(roomId) {
        const room = this.rooms[roomId];
        return room ? (room.items || []) : [];
    },

    removeItemFromRoom(roomId, itemId) {
        const room = this.rooms[roomId];
        if (!room || !room.items) return false;
        const idx = room.items.indexOf(itemId);
        if (idx === -1) return false;
        room.items.splice(idx, 1);
        return true;
    },

    addItemToRoom(roomId, itemId) {
        const room = this.rooms[roomId];
        if (!room) return false;
        if (!room.items) room.items = [];
        room.items.push(itemId);
        return true;
    },

    searchRoom(roomId) {
        const room = this.rooms[roomId];
        if (!room) return [];
        if (room.searched) return [];
        room.searched = true;
        const found = room.searchItems || [];
        if (found.length > 0) {
            if (!room.items) room.items = [];
            room.items.push(...found);
        }
        return found.map(id => {
            const def = this.itemIndex[id];
            return def ? { ...def } : { id, name: id };
        });
    },

    isRoomSearched(roomId) {
        const room = this.rooms[roomId];
        return room ? room.searched : false;
    },

    canMove(fromId, direction) {
        const room = this.rooms[fromId];
        if (!room || !room.exits) return { can: false, reason: 'There is no exit in that direction.' };
        const exit = room.exits[direction];
        if (!exit) return { can: false, reason: 'There is no exit in that direction.' };
        if (exit.locked) {
            return {
                can: false,
                reason: `The way is locked.${exit.lockRequires ? ` You need a ${this.getItemName(exit.lockRequires)}.` : ''}`,
                locked: true,
                lockRequires: exit.lockRequires
            };
        }
        return { can: true, roomId: exit.roomId };
    },

    unlockExit(roomId, direction) {
        const room = this.rooms[roomId];
        if (!room || !room.exits || !room.exits[direction]) return false;
        room.exits[direction].locked = false;
        return true;
    },

    markVisited(roomId) {
        const room = this.rooms[roomId];
        if (room) {
            room.visitCount = (room.visitCount || 0) + 1;
        }
    },

    isFirstVisit(roomId) {
        const room = this.rooms[roomId];
        return room ? (room.visitCount || 0) === 0 : false;
    },

    getItemDef(itemId) {
        return this.itemIndex[itemId] || null;
    },

    getItemName(itemId) {
        const def = this.itemIndex[itemId];
        return def ? def.name : itemId.replace(/_/g, ' ');
    },

    getZombieInfo(roomId) {
        const room = this.rooms[roomId];
        if (!room || !room.zombies) return null;
        return room.zombies;
    },

    isBarricadeable(roomId) {
        const room = this.rooms[roomId];
        return room ? !!room.barricadeable : false;
    },

    setBarricaded(roomId, value) {
        const room = this.rooms[roomId];
        if (room) room.barricaded = value;
    },

    isBarricaded(roomId) {
        const room = this.rooms[roomId];
        return room ? !!room.barricaded : false;
    },

    getRoomNote(roomId) {
        const room = this.rooms[roomId];
        return room ? room.notes : null;
    },

    getLightLevel(roomId) {
        const room = this.rooms[roomId];
        return room ? (room.lightLevel || 'bright') : 'bright';
    },

    getRoomZone(roomId) {
        const room = this.rooms[roomId];
        return room ? room.zone : 'unknown';
    },

    // Get all rooms the player has visited
    getVisitedRooms() {
        return Object.values(this.rooms).filter(r => r.visitCount > 0);
    },

    // Serialize world state for save
    serialize() {
        const state = {};
        for (const [id, room] of Object.entries(this.rooms)) {
            state[id] = {
                items: [...(room.items || [])],
                searchItems: [...(room.searchItems || [])],
                searched: room.searched,
                barricaded: room.barricaded,
                visitCount: room.visitCount,
                exits: JSON.parse(JSON.stringify(room.exits || {}))
            };
        }
        return state;
    },

    // Restore world state from save
    deserialize(state) {
        for (const [id, saved] of Object.entries(state)) {
            if (this.rooms[id]) {
                this.rooms[id].items = saved.items;
                this.rooms[id].searchItems = saved.searchItems;
                this.rooms[id].searched = saved.searched;
                this.rooms[id].barricaded = saved.barricaded;
                this.rooms[id].visitCount = saved.visitCount;
                if (saved.exits) {
                    for (const [dir, exitState] of Object.entries(saved.exits)) {
                        if (this.rooms[id].exits && this.rooms[id].exits[dir]) {
                            this.rooms[id].exits[dir].locked = exitState.locked;
                        }
                    }
                }
            }
        }
    }
};

export default World;
